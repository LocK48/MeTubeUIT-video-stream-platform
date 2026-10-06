import Redis from 'ioredis';
import "dotenv/config";

import { io } from '../middleware/socket.js';
import { formatOut } from '../../../worker_server/src/util/helper.js';
import { client } from '../config/db.js';
import { ObjectId } from 'mongodb';
import { NotificationModel } from '../model/notificationModel.js';

const redisPort = process.env.REDIS_PORT;
const redisHost = process.env.REDIS_HOST;
const redisPass = process.env.REDIS_PASSWORD;

const redisSub = new Redis({
    port: redisPort,
    host: redisHost,
    password: redisPass,
    maxRetriesPerRequest: null,
});;

redisSub.subscribe('video_ready', (err, count) => {
    if (err) console.error("Redis Subscribe Error:", err);
    console.log(`Server is listening ${count} channel from Redis.`);
});


redisSub.on('message', (channel, message) => {
    if (channel === 'video_ready') {
        const { videoId, status } = JSON.parse(message);
                io.to(videoId).emit('video_ready_UI', { status });

                // Also notify subscribers of the uploader about new video
                (async () => {
                    try {
                        const db = client.db('Metube');
                        const videosColl = db.collection('videoCollection');
                        const usersColl = db.collection('userCollections');

                        const video = await videosColl.findOne({ videoId });
                        if (!video) return console.warn('Video not found for notification', videoId);

                        const uploaderId = (video.userId || '').toString();
                        if (!uploaderId) return;

                        // Find subscribers who have subscribed to uploaderId
                        // find subscribers (exclude uploader itself to avoid duplicate notifications)
                        const subs = await usersColl.find({ subscriptions: { $in: [uploaderId] }, _id: { $ne: new ObjectId(uploaderId) } }).toArray();
                        if (!subs || subs.length === 0) return;

                        // fetch uploader details to embed into notification
                        const uploaderDoc = await usersColl.findOne({ _id: new ObjectId(uploaderId) });
                        const fromName = uploaderDoc?.name || uploaderId;
                        let fromAvatar = uploaderDoc?.avatarUrl || uploaderDoc?.avatar || null;
                        // normalize avatar to full URL when stored as a key/path
                        try {
                            if (fromAvatar && typeof fromAvatar === 'string' && !fromAvatar.startsWith('http')) {
                                const endpoint = (process.env.ENDPOINT || '').replace(/\/+$/, '');
                                const publicBase = (process.env.PUBLIC_ASSET_URL || '').replace(/\/+$/, '');
                                const key = fromAvatar.replace(/^\/+/, '');
                                fromAvatar = publicBase
                                    ? `${publicBase}/${key.startsWith('asset/') ? key : `asset/${key}`}`
                                    : `${endpoint}/${process.env.BUCKET_ASSET || 'asset'}/${key}`;
                            }
                        } catch (e) {
                            // noop - fallback to raw value
                        }

                        const notification = {
                            userId: null, // to be filled per recipient
                            type: 'new_video',
                            from: uploaderId,
                            fromName,
                            fromAvatar,
                            videoId,
                            videoThumbnail: video.thumbnailUrl || null,
                            title: video.title || '',
                            read: false,
                            createdAt: new Date(),
                        };

                        for (const s of subs) {
                            const n = { ...notification, userId: s._id };
                            const res = await NotificationModel.create(n);
                            // attach inserted id and stringify userId for socket payload
                            const payload = { ...n, _id: res.insertedId?.toString(), userId: s._id.toString() };
                            // emit to user room
                            io.to(`user_${s._id.toString()}`).emit('notification', payload);
                        }
                        // Also create a confirmation notification for the uploader themselves
                        try {
                            const uploaderNotification = {
                                userId: new ObjectId(uploaderId),
                                type: 'upload_success',
                                from: uploaderId,
                                fromName,
                                fromAvatar,
                                videoId,
                                videoThumbnail: video.thumbnailUrl || null,
                                title: video.title || '',
                                read: false,
                                createdAt: new Date(),
                            };
                            const r2 = await NotificationModel.create(uploaderNotification);
                            const payloadUp = { ...uploaderNotification, _id: r2.insertedId?.toString(), userId: uploaderId };
                            io.to(`user_${uploaderId}`).emit('notification', payloadUp);
                        } catch (e) {
                            console.error('Failed to notify uploader:', e);
                        }
                    } catch (e) {
                        console.error('Failed to notify subscribers:', e);
                    }
                })();

                console.log(`[+] Server informed UI via Socket - Video ${formatOut(videoId)} is READY`);
    }
});
