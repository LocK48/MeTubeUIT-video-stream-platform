import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getWatchLater, removeWatchLater } from '../service/userDataService.js';
import { displayDuration, timeAgo } from '../utils/cal_in4.js';
import { formatOut } from '../../../../worker_server/src/util/helper.js';
import { Trash2, ClockFading } from 'lucide-react';
import { processedStorageBase } from '../utils/storageUrl.js';

const s3_url = processedStorageBase;

const WatchLaterPage = () => {
  const { user } = useAuth();
  const [list, setList] = useState([]);

  useEffect(() => {
    setList(getWatchLater(user));
  }, [user]);

  const handleRemove = (videoId) => {
    const next = removeWatchLater(user, videoId);
    setList(next);
  };

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto px-2 py-4">
        <h1 className="text-3xl font-bold mb-3">Xem sau</h1>
        <p className="text-md text-blue-300 leading-relaxed mb-4">Bạn cần đăng nhập để tiếp tục.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-2 py-4">
      <h1 className="text-3xl font-bold mb-3">Xem sau</h1>
      <p className="text-md text-blue-400 leading-relaxed mb-6">Các video đã lưu sẽ xuất hiện ở đây.</p>

      {list.length === 0 ? (
        <div className="w-fit rounded-xl border-none bg-neutral-900 p-3 text-blue-100">
          Bạn chưa lưu video nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 md:grid-cols-3 gap-2">
          {list.map((item) => (
            <div key={item.videoId} className="w-fit group overflow-hidden rounded-3xl bg-neutral-700 p-3 no-underline hover:bg-gray-300 transition flex gap-4 items-center">
              <Link to={`/video/${item.videoId}`} className="flex items-center gap-3 no-underline flex-1">
                <div className="w-[140px] h-[78px] rounded-xl overflow-hidden bg-[#222222] flex-shrink-0">
                  <img src={`${s3_url}/${item.thumbnailUrl}/thumbnail.jpg`} alt={item.title} className="w-full h-full object-cover" />
                </div>
                <div className='flex flex-col leading-none space-y-0.5'>
                  <p className="text-md font-semibold text-blue-400 mb-0 mt-1 leading-none tracking-tighter">{formatOut(item.title, 25)}</p>
                  <p className="text-sm font-semibold text-neutral-500">{item.channelName || 'Unknown'}</p>
                  <p className="text-sm text-neutral-500 mt-1 flex gap-2 items-center mb-0"><ClockFading size={18} color='#007FFF'/>{timeAgo(item.createdAt)}</p>
                  <div className="flex-shrink-0 ml-auto">
                    <button onClick={() => handleRemove(item.videoId)} className="text-sm p-1 rounded-full bg-red-600 text-white">
                      <Trash2 size={18} className='text-black animate-pulse'/>
                    </button>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WatchLaterPage;
