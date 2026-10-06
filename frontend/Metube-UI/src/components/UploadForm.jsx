import React, { useState, useRef , useEffect } from 'react';
import { Info, X, Upload, CircleHelp, ImagePlus, Sparkles, PenTool, SearchCheck, LoaderCircle, TentIcon} from 'lucide-react';

import axios from 'axios';
import { Toaster } from 'react-hot-toast';
import { io } from "socket.io-client";

import { notifyError, notifySuccess, notifyEmpty } from '../helper/popUp.js';
import { vnTimeString } from '../../../../api_server/src/util/helper.js';
import { VIDEO_STATUS } from '../../../../api_server/src/util/constants.js';
import { getFrameFromVideo } from '../helper/pickFrameVid.js';
import { cleanUploadForm } from '../helper/resetUpload.js';
import { validateThumbnailFile } from '../helper/checkInImg.js';
import { uploadImgS3 } from '../service/uploadImg.js';

import ThumbnailPicker from "./ThumbnailOptions.jsx";

// Security check
import { validFileExtension, validFileSize, validMimeType } from '../helper/security.js';

// S1  - Presigned URL
// S2  - Initialize DB with videoId & status = "uploading"
// S3  - Upload raw video to Vietnix
import { uploadS3 } from '../service/uploadRaw.js'; 
import { apiOrigin } from '../service/apiBase.js';

// S4  - Upload done & confirm with api server
// S5  - Api server checks upload confirmation
import { uploadCnf } from '../service/apiCnf.js';

// S6  - Upload user's uploaded file to Vietnix
// S7  - Api server updates DB with status = "processing" + title + description...; 
//       send worker thumbnail info when client presses button
// S8  - Api server pushes job for worker server to handle
// S9  - Worker server done & sends a signal to Api server using Redis
// S10 - Api server listens to signal & shoots Socket to UI to close form
import { whenSubmit } from '../service/afterPress.js';

const host = apiOrigin;

const UploadWizard = ({closeUploadPage}) => {
    const [page, setPage] = useState(1); // Page 1: Upload, Page 2: Details
    const [file, setFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [previewVid, setPreviewVid] = useState(null);
    const [progress, setProgress] = useState(0);
    const [vidKey, setVidKey] = useState(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [thumbnailUrl, setThumbnailUrl] = useState("");
    const [autoGenThumbPrev, setAutoGenThumbPrev] = useState(null);
    const [pickedThumb, setPickedThumb] = useState(null);
    const [uploadThumb, setUploadThumb] = useState(null);
    const [pressBtn, setPressBtn] = useState(false);
    const [publishDone, setPublishDone] = useState(false);
    const [closeFormAuto, setCloseFormAuto] = useState(false);

    const autoGenThumb = { timestamp: 1 };

    // Handle Click to choose file video
    const fileInputRef = useRef(null);
    const onButtonClick = () => {
        fileInputRef.current.click();
    };

    // --- LOGIC HANDLE FILE---
    const handleFiles = (files) => {
        const uploadedFile = files[0];
        if(!uploadedFile) return;

        const { name, type, size } = uploadedFile;
        // Check valid MIME
        if(!validMimeType(type)){
            notifyError("Unallowed MIME type");
            return;
        }
        // Check valid file size
        if(!validFileSize(size)){
            notifyError("Exceeded allowed max file size");
            return;
        }
        // Only allow video file extension
        if(!validFileExtension(name)){
            notifyError("Unallowed file video extension");
            return;
        }

        setFile(uploadedFile);
        setPage(2);
    };

    const onDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => setIsDragging(false);

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    const cleanUp = () => {
        closeUploadPage({
            setFile, setPreviewVid, setProgress, setVidKey, setTitle, setDescription, 
            setThumbnailUrl, setAutoGenThumbPrev, setPickedThumb, setUploadThumb})
        setPage(1);
    }
    // ---------------------
    // --- VIDEO PREVIEW ---
    // ---------------------

    // Create local URL when user selected file
    // Note: useEffect(() => {}, [e])
    // ----  Run if state/props change
    useEffect(() => {
        if(file){
            // Create a temporary URL for video file
            const tmpURL = URL.createObjectURL(file);
            setPreviewVid(tmpURL);

            const startVideoProcess = async() => {
                try{
                    // Progress bar starts with 0%
                    setProgress(0);
                    const key = await uploadS3(file, (percent) => setProgress(percent));
                    // Save video key for next step
                    setVidKey(key)
                    // UI confirms upload status with api server
                    // Api server checks UI's confirmation & updates DB status
                    const cnf = await uploadCnf(key);
                    if(cnf !== VIDEO_STATUS.PROCESSING) return;
                }
                catch(err){
                    console.error(err);
                    notifyError(err.message); // Use "err" will trigger error
                }
            }
            // Start upload video process right after user dragged or selected file
            startVideoProcess();
            // Clean up to prevent memory leak
            return () => URL.revokeObjectURL(tmpURL);
        }
    }, [file]);

    // Set default "auto generate" thumbnail right after video uploaded
    useEffect(() => {
        if (previewVid) {
            getFrameFromVideo(previewVid, 1).then(setAutoGenThumbPrev);
        }
    }, [previewVid]);

    // --------------------------------------
    // --- LOGIC HANDLE WHEN PRESS BUTTON --------
    // --------------------------------------    |
    //                                           |
    // When user click PUBLISH                   |  
    // --> button loading in minutes             | 
    // --> change label "DONE"                   |
    // --> auto close form in 2 seconds          |
    //                                           |
    // --------------------------------------    |
    // --- LOGIC SOCKET TO ACCEPT SIGNAl <--------   
    // --------------------------------------

    useEffect(() => {
        if (!vidKey || !pressBtn) return;
        const socket = io(host);
        // Go to private room to communicate with Api server
        socket.emit("join_video_room", vidKey);
        console.log("Joined room:", vidKey);
        // Listen signal from Api server to continue
        socket.on("video_ready_UI", (signal) => {
            if (signal.status === VIDEO_STATUS.READY) {
                setPublishDone(true);
                setPressBtn(false);

                notifySuccess("Video uploaded successfully");
                setTimeout(() => {
                    cleanUp();  // Delay 1.5 seconds before closing form 
                }, 1500);
            }
        });
        return () => {
            // Disconnect UI after finishing job
            socket.off("video_ready_UI");
            socket.disconnect();
        };
    }, [vidKey, pressBtn]);

    const handleSubmit = async (e) => {
        // Avoid reload page
        e.preventDefault();

        // Disable PUBLISH button to prevent spaming
        if(pressBtn || publishDone) return;

        let thumbPath = null;

        // Warning if have any empty input
        if(!title.trim() || !description.trim()){
            notifyEmpty(`Your ${!title.trim()? "title" : "description"}`);
            return;
        }

        // All requirement satisfied then
        // --- HANDLE UPLOAD PROCEDURE ---
        try{
            // UI displays processing
            setPressBtn(true);
            // Upload user's uploaded file to Vietnix
            if(uploadThumb?.file) { thumbPath = await uploadImgS3(uploadThumb.file, vidKey); }

            // Update DB with status = "processing" + title + description
            // Send metadata of thumbnail option for worker server to handle
            // Push next jobs for worker server to handle
            await whenSubmit(vidKey, {
                title: title,
                description: description,
                status: VIDEO_STATUS.PROCESSING,
                // If 2 field null or undefine --> AutoGenThumb
                // If timestamp is not empty   --> PickedThumb
                // If file is not empty        --> UploadThumb

                // Metadata for processing thumbnail
                thumbIn4: {
                    timestamp: thumbnailUrl?.timestamp ?? null,
                    file: thumbPath ? `${thumbPath}/thumbnail.jpg` : null, // Path to vietnix storing user's uploaded file
                }
            });
        }
        catch(err){
            console.error("Upload Error:", err);
            notifyError(err.message);
            setPressBtn(false);
        }
    };

    // --- UPLOAD FORM ---
    const UploadStep = () => (
        <div className="container d-flex justify-content-center align-items-center">
            <Toaster
                position="top-right"
                reverseOrder={false}
            />
            <div 
                className={`card bg-dark text-white shadow-lg w-100 ${isDragging ? 'border-primary' : 'border-secondary'}`}
                style={{ minHeight: '500px', maxWidth: '1000px', borderRadius: '15px', borderStyle: isDragging ? 'dotted' : 'solid', borderWidth: '2px', transition: 'all 0.2s ease'}}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
            >
            {/* Stablize card when dragging video file */}
            <div className={`card-content ${isDragging ? 'pointer-events-none' : ''}`} style={{ pointerEvents: isDragging ? 'none' : 'auto' }}>
                <div className="card-header d-flex justify-content-between align-items-center border-secondary py-3">
                    <h5 className="mb-0 fw-bold">Upload your video</h5>
                    <X className="text-secondary cursor-pointer" size={22} color='white' onClick={closeUploadPage}/>
                </div>
                <div className="card-body text-center py-3 mt-12">
                    <div className="upload-icon-wrapper mb-3">
                        <div className={`d-inline-block p-4 rounded-circle ${isDragging ? 'bg-light' : 'bg-secondary'} bg-opacity-25`}>
                            <Upload size={80} className={isDragging ? 'text-primary' : 'text-secondary'} />
                        </div>
                    </div>
                    <div className="mb-4">
                        <p className="fs-5 mb-1">{isDragging ? "Drop it here" : "Drag and drop video file to upload"}</p>
                        <p className="text-secondary small">Your videos will be private until you publish them</p>
                    </div>
                    <input // Hide input file 
                        type="file" 
                        id="fileInput" 
                        className="d-none"
                        accept="video/*" 
                        ref={fileInputRef}
                        onChange={(e) => handleFiles(e.target.files)} 
                    />
                    <button type="button" className="btn btn-outline-danger" onClick={onButtonClick}>Select video</button>
                    <div className="mb-3 mt-20">
                        <p className="text-secondary small mb-1">By submitting your video, you acknowledge that you agree to 
                            <span style={{color: '#0099FF', cursor: 'pointer'}}>&nbsp;MeTube's Terms of Service</span> and 
                            <span style={{color: '#0099FF', cursor: 'pointer'}}>&nbsp;Community Guidelines</span>.</p>
                        <p className="text-secondary small">You must ensure that you do not violate the copyright or privacy of others.</p>
                    </div>
                </div>
            </div>
        </div>       
    </div>
);

    return page === 1? <UploadStep/> : (
        <DetailStep
            file={file}
            previewVid={previewVid}
            progress={progress}
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            handleSubmit={handleSubmit}
            setPage={setPage}
            thumbnailUrl={thumbnailUrl}
            setThumbnailUrl={setThumbnailUrl}
            autoGenThumbPrev={autoGenThumbPrev}
            pickedThumb={pickedThumb}
            setPickedThumb={setPickedThumb}
            uploadThumb={uploadThumb}
            setUploadThumb={setUploadThumb}
            pressBtn={pressBtn}
            publishDone={publishDone}
            cleanUp={cleanUp}
        />
    );
};

// --- DETAIL STEP ---
    const DetailStep = ({ 
        file, previewVid, progress, title, setTitle, description, setDescription, handleSubmit, setPage, thumbnailUrl, 
        setThumbnailUrl, autoGenThumbPrev, pickedThumb, setPickedThumb, uploadThumb, setUploadThumb, pressBtn, publishDone, 
        cleanUp,
    }) => {
        const [thumbPickerOpen, setThumbPickerOpen] = useState(false);
        const [activeThumbOps, setActiveThumbOps] = useState(1);
        const fileRef = useRef(null);

        const thumbnailExt = [
            {icon: ImagePlus, content: "Upload file"},
            {icon: Sparkles , content: "Auto generate"},
            {icon: PenTool  , content: "Create, your way"},
        ];

        // Handle if user uploads file to make thumbnail
        const handleFileIn = async(e) => {
            const file = e.target.files?.[0];
            try{
                // Check file before continue processing 
                await validateThumbnailFile(file);
                const fURL = URL.createObjectURL(file);
                setUploadThumb({
                    file: file,
                    image: fURL,
                })
                setThumbnailUrl({
                    timestamp: null,
                    image: null,
                })
            }
            catch(err){
                notifyError(err.message);
                e.target.value = "";
            }
        }

        return (
        <form onSubmit={handleSubmit}> 
        {/* Customize warning message if errors happen */}
            <Toaster
                position="top-right"
                reverseOrder={false}
            />
        <div className="container mt-5 pb-5">
            <div className="card bg-dark text-white shadow-lg border-0" style={{ borderRadius: '25px', maxWidth: '1100px'}}>
                <div className="card-header d-flex justify-content-between align-items-center border-secondary py-3 bg-transparent">
                    <h5 className="mb-0 fw-bold text-truncate" style={{maxWidth: '70%'}}>File: {file?.name}</h5>
                    <X className="text-secondary cursor-pointer" 
                        onClick={ cleanUp } 
                        size={20} />
                </div>
                <div className="card-body p-4" style={{ 
                    maxHeight: '70vh',
                    overflowY: 'auto', 
                    padding: '1.5rem',
                    scrollbarWidth: 'thin', 
                    scrollbarColor: '#444 transparent' 
                }}>
                    <div className="row g-4">
                        <h4 className="mb-2">Details</h4>
                        <div className="col-lg-8">
                            <div className="mb-4 p-3 border border-secondary rounded bg-dark">
                                <label className="form-label text-secondary small d-flex align-items-center gap-1">
                                    Title (required) <CircleHelp size={14} />
                                </label>
                                <textarea value={title} spellCheck="false" maxLength="200" className="form-control bg-transparent text-white border-0 p-0 shadow-none" rows="1" placeholder="Give your video a cool title..." style={{ resize: 'none' }} 
                                    onChange={(e) => setTitle(e.target.value)}/>
                            </div>
                            <div className="mb-4 p-3 border border-secondary rounded bg-dark">
                                <label className="form-label text-secondary small d-flex align-items-center gap-1">
                                    Description <CircleHelp size={14} />
                                </label>
                                <textarea value={description} spellCheck="false" maxLength="5000" className="form-control bg-transparent text-white border-0 p-0 shadow-none" rows="4" placeholder="Tell viewers more..." style={{ resize: 'none' }}
                                    onChange={(e) => setDescription(e.target.value)}/>
                            </div>
                            <div>
                                <label className="form-label">
                                    <p className='text-[md]-white font-semibold mb-0.5'>Thumbnail generate</p>
                                    <p className='text-[#666666] text-sm mb-1'>Choose a compelling thumbnail to grab viewers' attention. 
                                        <span style={{color: '#007FFF'}}>&nbsp;Learn more</span>
                                    </p>
                                </label>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    className="d-none"
                                    onChange={handleFileIn}
                                />

                                <div className='flex flex-row gap-2 cursor-pointer'>
                                    {thumbnailExt.map((e,idx) => {
                                        const {icon:Icon, content} = e;
                                        return (
                                            <div key={idx} 
                                                className={`${activeThumbOps === idx? "bg-gray-600 text-white" : "text-[#666666]"} 
                                                group 
                                                flex flex-col align-items-center justify-content-center 
                                                hover:bg-gray-500 hover:text-white 
                                                transition duration-300`}
                                                style={{
                                                    width: '170px', 
                                                    height: '85px', 
                                                    border: `dashed ${activeThumbOps === idx? '3px white' : '1px #666'}`,
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center',
                                                    backgroundImage: 
                                                        (idx === 0 && uploadThumb?.image)? `url(${uploadThumb.image})` :
                                                        (idx === 1 && autoGenThumbPrev)? `url(${autoGenThumbPrev})` : 
                                                        (idx === 2 && thumbnailUrl?.image)? `url(${thumbnailUrl.image})` : 
                                                        "none",
                                                    cursor: progress < 100 ? 'not-allowed' : 'pointer',
                                                    opacity: progress < 100 ? 0.25 : 0.55,
                                                }}
                                                onClick={() => {
                                                    if(progress < 100) return;
                                                    setActiveThumbOps(idx);

                                                    if(idx === 2){
                                                        setUploadThumb(null); // Disable upload file card when choosing picked card
                                                        setThumbPickerOpen(true);
                                                    }
                                                    else setThumbPickerOpen(false);

                                                    if(!idx) fileRef.current?.click();
                                                }}>
                                                <Icon size={24} style={{color: (idx == 1)? 'oklch(70.5% 0.015 286.067)' : 'white', margin: '15px 0 1px 0'}}/>
                                                <p className="text-sm group-hover:text-white">{content}</p>
                                            </div>
                                        )
                                    })}
                                </div>
                                { thumbPickerOpen && (<ThumbnailPicker 
                                previewVid={previewVid} 
                                setThumbnailUrl={(info) => {
                                    setThumbnailUrl(info);
                                    setPickedThumb(true);
                                    setActiveThumbOps(2);
                                }} 
                                onClose={() => {
                                    setThumbPickerOpen(false); 
                                    setActiveThumbOps(2);
                                }}
                                // Reset to default: using auto-generated thumbnail
                                handleReset={() => {
                                    setThumbPickerOpen(false);
                                    setActiveThumbOps(1);
                                }}
                                />)}
                            </div>
                        </div>
                        <div className="col-lg-4">
                            <div className="card bg-black border-secondary">
                                <div className="ratio ratio-16x9 bg-secondary bg-opacity-25 d-flex align-items-center justify-content-center">
                                    {
                                        (previewVid && progress === 100)? (
                                           <video src={previewVid} autoPlay loop controls className="w-100 h-100 rounded-tl rounded-tr" style={{objectPosition:'contain'}}/>
                                        ):(<span className="text-secondary small text-center px-2 mt-2">Video Preview</span>)
                                    }
                                </div>
                                <div className="card-body p-3">
                                    <div className="progress bg-secondary bg-opacity-25" style={{height: '5px'}}>
                                        <div className={`progress-bar ${progress < 100? "progress-bar-striped" : ""} progress-bar-animated`} style={{width: `${progress}%`}}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card-footer border-secondary flex flex-row align-items-center justify-between p-3 bg-transparent py-1">
                    {progress === 100? 
                        (<p className="text-[#666666] text-sm flex flex-row gap-2 mt-3"><SearchCheck color='white'></SearchCheck>Inspection completed. No issues found.</p>):
                        (<p className="text-white text-sm flex flex-row gap-2 mt-3">Loading<LoaderCircle color='white' className='animate-spin'></LoaderCircle></p>)
                    }
                        <button type="submit" disabled={progress < 100 || publishDone || pressBtn} 
                            className={`btn ${publishDone? "btn-danger" : pressBtn? "btn-secondary opacity-50" : "btn-primary"} px-4 fw-bold transition-all duration-300`}>
                            {publishDone? "DONE" : pressBtn? (
                                <span className="d-flex align-items-center gap-2">
                                    PROCESSING... <LoaderCircle size={18} className="animate-spin" />
                                </span>)
                                 : "PUBLISH"}
                        </button>       
                </div>
            </div>
        </div>
        </form>
    )};

export default UploadWizard;
