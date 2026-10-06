import React, { useEffect, useState, useCallback } from 'react';
import ShortPlayer from '../components/ShortPlayer.jsx';
import { useNavigate } from 'react-router-dom';
import { processedStorageBase } from '../utils/storageUrl.js';
import { apiBase } from '../service/apiBase.js';

const hostPath = `${apiBase}/videos`;
const prefix = processedStorageBase;

const ShortsPage = () => {
  const [shorts, setShorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(hostPath);
        const data = await res.json();
        // filter shorts: duration <= 60 seconds and status ready
        const filtered = (data || []).filter(v => (v.duration || 0) <= 60 && (v.status === 'ready' || v.status === undefined));
        setShorts(filtered);
      } 
      catch (err) {
        console.error('Failed to load shorts', err);
        setShorts([]);
      } 
      finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleVisible = useCallback((videoId) => {
    const idx = shorts.findIndex(s => s.videoId === videoId);
    if (idx !== -1) setCurrentIndex(idx);
  }, [shorts]);

  if (loading) return <div className="flex items-center justify-center h-screen text-white">Loading shorts...</div>;
  if (!shorts.length) return <div className="flex items-center justify-center h-screen text-white">No shorts available</div>;

  return (
    <div className="w-full h-screen bg-black-500 text-white overflow-y-auto snap-y snap-mandatory relative">
      <div className="flex flex-col">
        {shorts.map((s) => (
          <div key={s.videoId} className="min-h-[calc(100vh-56px)] h-[calc(100vh-56px)] snap-start flex items-start justify-center pt-2 mb-6">
            <div className="relative w-full flex items-center justify-center">
              <div className="w-full max-w-[760px] px-4">
                <ShortPlayer video={s} prefix={prefix} onVisible={handleVisible} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShortsPage;
