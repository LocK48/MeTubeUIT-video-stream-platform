import { Search, Menu, Video, Bell, User, Mic, Play, Plus, LogOut, Pencil } from "lucide-react";

import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';

import { useAuth } from "../context/AuthContext.jsx";

import { getNotifications, markNotificationRead } from '../service/authService.js';
import { formatOut } from "../../../../worker_server/src/util/helper.js";
import { getUserPublic } from '../service/authService.js';
import { processedStorageBase } from '../utils/storageUrl.js';
import { apiOrigin, apiBase } from '../service/apiBase.js';

const formatRelativeTime = (d) => {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs} giây`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} phút`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  return `${days} ngày`;
};

const absoluteUrl = (val) => {
  if (!val) return null;
  if (typeof val !== 'string') return null;
  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  if (val.startsWith('/')) return `${window.location.origin}${val}`;
  return `${window.location.origin}/${val.replace(/^\//, '')}`;
};

const Navbar = ({ goToUploadPage, toggleSidebar }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const allVideosRef = useRef([]);
  const blurTimerRef = useRef(null);
  const socketRef = useRef(null);
  const hostPath = `${apiBase}/videos`;
  const userCacheRef = useRef(new Map());


  useEffect(() => {
    const h = localStorage.getItem('search_history');
    if (h) {
      try { 
        setHistory(JSON.parse(h)); 
      } 
      catch { setHistory([]); }
    }

    // Prefetch videos to provide suggestions
    (async () => {
      try {
        const res = await fetch(hostPath);
        const data = await res.json();
        allVideosRef.current = data || [];
      } 
      catch (err) {
        allVideosRef.current = [];
      }
    })();
  }, []);

  // Connect socket and join user room for notifications
  useEffect(() => {
    if (!user) return;
    const socket = io(apiOrigin, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      console.debug('Socket connected', socket.id, 'joining user room', user.id);
      socket.emit('join_user', user.id);
    });

    socket.on('notification', async (n) => {
      console.debug('Received notification via socket:', n);
      try {
        const enriched = await enrichNotification(n);
        setNotifications((prev) => [enriched, ...prev]);
      } catch (e) {
        console.error('Failed to enrich incoming notification', e);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connect error', err);
    });

    // load existing notifications once
    (async () => {
      try {
        const res = await getNotifications();
        if (res && res.notifications) {
          const arr = res.notifications.map(n => ({ ...n, _id: n._id?.toString() }));
          const enrichedList = await Promise.all(arr.map(enrichNotification));
          setNotifications(enrichedList);
        }
      } catch (e) { console.error('Failed to load notifications', e); }
    })();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // clear notifications when user logs out
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setShowNotif(false);
      try { 
        socketRef.current?.disconnect(); 
      } 
      catch {}
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/');

    
  };

  const enrichNotification = async (n) => {
    if (!n) return n;
    // ensure _id is string
    const note = { ...n, _id: n._id?.toString ? n._id.toString() : n._id };
    if (note.fromAvatar && note.fromName) return note;
    const fromId = note.from;
    if (!fromId) return note;
    const cache = userCacheRef.current;
    if (cache.has(fromId)) {
      const u = cache.get(fromId);
      return { ...note, fromName: note.fromName || u.name, fromAvatar: note.fromAvatar || u.avatarUrl };
    }
    try {
      const res = await getUserPublic(fromId);
      if (res && res.user) {
        cache.set(fromId, res.user);
        return { ...note, fromName: note.fromName || res.user.name, fromAvatar: note.fromAvatar || res.user.avatarUrl };
      }
    } catch (e) {
      console.error('Failed to enrich notification', e);
    }
    return note;
  };

  const pushHistory = (q) => {
    if (!q) return;
    const next = [q, ...history.filter((x) => x !== q)].slice(0, 10);
    setHistory(next);
    localStorage.setItem('search_history', JSON.stringify(next));
  };

  const handleSearch = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const q = (searchQuery || '').trim();
    if (!q) return;
    pushHistory(q);
    navigate(`/search?q=${encodeURIComponent(q)}`);
    setFocused(false);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleBellClick = async () => {
    const opening = !showNotif;
    setShowNotif(opening);
    if (opening) {
      const unread = notifications.filter(n => !n.read);
      if (unread.length === 0) return;
      try {
        await Promise.all(unread.map(n => markNotificationRead(n._id)));
      } 
      catch (e) { console.error('Mark all read failed', e); }
      // update local state
      setNotifications((prev) => prev.map(p => ({ ...p, read: true })));
    }
  };

  const handleSuggestionClick = (val) => {
    setSearchQuery(val);
    pushHistory(val);
    navigate(`/search?q=${encodeURIComponent(val)}`);
    setFocused(false);
  };

  const updateSuggestions = (q) => {
    if (!q) {
      // show history or recommendation
      const popular = (allVideosRef.current || []).slice(0, 6).map(v => v.title).filter(Boolean);
      setSuggestions(history.length ? history : popular);
      return;
    }
    const text = q.toLowerCase();
    const matches = (allVideosRef.current || []).filter(v => (`${v.title || ''} ${v.description || ''} ${v.channelName || ''} ${v.userId?.name || ''}`).toLowerCase().includes(text)).slice(0,6);
    const mapped = matches.map(m => m.title || m.channelName || m.videoId);
    setSuggestions(mapped.length ? mapped : [q]);
  };

  return (
    <nav className="fixed top-0 w-full bg-[#0f0f0f] text-white flex justify-between items-center px-4 h-14 z-50">
      {/* Left side: Menu & Logo */}
      <div className="flex items-center gap-3">
        <button onClick={toggleSidebar} className="p-2 hover:bg-[#272727] border-none rounded-full transition text-white">
          <Menu size={23} strokeWidth={1.5} />
        </button>
        
        <div 
          onClick={() => navigate("/")} 
          className="flex items-center gap-1 cursor-pointer"
        >
          <div className="bg-red-600 p-1 rounded-lg">
             <Play size={20} color="red" fill="white" className="w-7 h-4"/>
          </div>
          <span className="font-semibold text-[22px] tracking-[-0.11em] text-white hover:no-underline">MeTube <sup className="text-[10px] text-gray-400 -translate-y-2 inline-block tracking-tight">VN</sup></span>
        </div>
      </div>

      <div className="hidden md:flex flex-1 max-w-[720px] ml-10 items-center gap-4">
        <form onSubmit={handleSearch} className={`flex w-full ${focused? 'border-2 border-blue-400 rounded-pill':''}`}>
            <div className="relative flex items-center w-full bg-[#121212] rounded-l-full px-4 py-2 focus-within:border-[#1c62b9] focus-within:ml-[-1px] transition-all">
            <Search size={18} className="text-[#aaaaaa] mr-3 hidden focus-within:block" />
            <input 
              autoComplete="false"
              spellCheck="false"
              type="text" 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); updateSuggestions(e.target.value); }}
              onFocus={() => { setFocused(true); updateSuggestions(searchQuery); }}
              onBlur={() => { blurTimerRef.current = setTimeout(() => setFocused(false), 150); }}
              placeholder="Tìm kiếm" 
              className={`w-full bg-transparent outline-none text-[17px] placeholder-[#aaaaaa] text-[#f1f1f1]`}
            />

            {focused && suggestions && suggestions.length > 0 && (
              <div className="absolute left-4 top-full mt-3 w-fit max-h-72 overflow-auto rounded-2xl bg-neutral-900 border-none shadow-2xl p-1 z-50">
                {suggestions.map((s, idx) => (
                  <div key={idx} onMouseDown={() => { 
                    if (blurTimerRef.current) clearTimeout(blurTimerRef.current); handleSuggestionClick(s); }} className="flex gap-2 font-semibold px-3 py-2.5 hover:bg-[#1a1a1a] cursor-pointer text-[#e6e6e6] text-md rounded-md tracking-tight">
                    <Search/> {s}
                  </div>
                ))}
                {suggestions.length === 0 && <div className="px-3 py-2 text-[#777]">No suggestions</div>}
              </div>
            )}
          </div>
          <button type="submit" className="bg-[#222222] border-none rounded-r-full px-4 py-1.5 hover:bg-[#272727] transition shadow-sm group">
            <Search size={20} strokeWidth={2.5} className="text-[#f1f1f1]" />
          </button>
        </form>
        <button className="p-2.5 bg-[#181818] hover:bg-[#272727] rounded-full transition text-white">
          <Mic size={20} />
        </button>
      </div>

      <div className="flex items-center gap-1 md:gap-4">
        <button className="p-2 hover:bg-[#272727] rounded-full hidden sm:block text-white" onClick={goToUploadPage}>
          <Plus size={24} strokeWidth={1.5} />
        </button>
        
        <div className="relative">
          <button 
            onClick={handleBellClick} 
            className={`p-2 hover:bg-[#272727] rounded-full hidden sm:block text-white transition-colors relative ${showNotif ? 'bg-[#272727]' : ''}`}
          >
            <Bell size={24} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 bg-red-400 text-sm font-medium text-neutral-700 rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-none">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotif && createPortal(
            <div className="fixed top-16 right-10 z-[9999]">
              <div className="w-[500px] max-h-[580px] overflow-hidden bg-[#212121] rounded-xl shadow-[0_4px_32px_0_rgba(0,0,0,0.6)] flex flex-col border-none">
                <div className="px-4 py-2 border-b border-zinc-700 flex items-center justify-between bg-[#212121]">
                  <span className="font-semibold text-[16px] text-blue-100">Thông báo</span>
                  <button className="p-1.5 hover:bg-[#383838] rounded-full text-zinc-400 hover:text-white transition-colors">
                    <Pencil size={20} className="text-blue-200"/>
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 max-h-[500px] custom-scrollbar bg-[#212121]">
                  {notifications.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
                      <Bell size={48} strokeWidth={1} className="text-zinc-600" />
                      <span className="text-sm text-zinc-400">Thông báo của bạn sẽ xuất hiện ở đây</span>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <NotificationItem 
                        key={n._id} 
                        note={n} 
                        onOpen={() => {
                          if (n.videoId) navigate(`/watch?v=${encodeURIComponent(n.videoId)}`);
                          (async () => {
                            try { 
                              await markNotificationRead(n._id); 
                            } 
                            catch (e) { 
                              console.error(e); 
                            }
                          })();
                          setShowNotif(false);
                        }} 
                      />
                    ))
                  )}
                </div>
              </div>
            </div>, document.body)
          }
        </div>
        
        {user ? (
          <div className="flex items-center">
            <button
              onClick={() => navigate('/profile')}
              className="p-1 border-none text-[#FFFFFF] rounded-full flex items-center gap-2 px-3 hover:bg-[#272727] hover:border-transparent transition"
            >
              <div className="border-2 border-blue-500 rounded-full p-0.5">
                <img
                  src={user?.avatarUrl || user?.image || "https://tinyurl.com/49hydya9"}
                  alt="avatar"
                  className="h-8 w-8 rounded-full object-cover"
                />
              </div>
              <span className="text-md font-semibold hidden md:inline text-white truncate max-w-[120px]">
                {user.name.split(' ').at(-1)}
              </span>
            </button>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-[#272727] rounded-full text-white transition hidden sm:block"
              title="Đăng xuất"
            >
              <LogOut size={22} strokeWidth={3} />
            </button>
          </div>
        ) : (
          <button
            className="group p-1.5 border-none text-[#FFFFFF] rounded-full flex items-center gap-2 px-3 hover:bg-[#263850] hover:border-transparent transition ml-2"
            onClick={() => navigate('/login')}
          >
            <div className="border-2 border-[#007FFF] rounded-full p-0.5 group-hover:border-[#FF3366]">
              <User size={20} strokeWidth={3} className="text-[#007FFF] group-hover:text-[#FF3366]"/>
            </div>
            <span className="text-[16px] text-[#007FFF] font-bold hidden md:inline hover:no-underline group-hover:text-[#FF3366]">Đăng nhập</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

const NotificationItem = ({ note, onOpen }) => {
  const time = note.createdAt ? formatRelativeTime(note.createdAt) + ' trước' : '';
  const isUnread = !note.read;
  const [avatarSrc, setAvatarSrc] = useState(null);

  useEffect(() => {
    let mounted = true;
    const embedded = note.uploader?.avatarUrl || note.fromAvatar;
    if (embedded) {
      setAvatarSrc(absoluteUrl(embedded));
      return () => { mounted = false; };
    }

    if (!note.from) {
      setAvatarSrc(`https://ui-avatars.com/api/?name=${encodeURIComponent(note.fromName || 'User')}&background=0D1117&color=ffffff&size=128`);
      return () => { mounted = false; };
    }

    (async () => {
      try {
        const res = await getUserPublic(note.from);
        if (!mounted) return;
        const u = res?.user;
        const candidate = u?.avatarUrl || u?.avatar || null;
        if (candidate) setAvatarSrc(absoluteUrl(candidate));
        else setAvatarSrc(`https://ui-avatars.com/api/?name=${encodeURIComponent(u?.name || note.from)}&background=0D1117&color=ffffff&size=128`);
      } 
      catch (e) {
        if (!mounted) return;
        setAvatarSrc(`https://ui-avatars.com/api/?name=${encodeURIComponent(note.fromName || note.from || 'User')}&background=0D1117&color=ffffff&size=128`);
      }
    })();

    return () => { mounted = false; };
  }, [note]);

  const thumbSrc = note.videoThumbnail ? 
  `${processedStorageBase}/${note.videoThumbnail}/thumbnail.jpg` : 
  'https://tinyurl.com/4tv7h8er';

  return (
    <div 
      onClick={onOpen} 
      className={`px-4 py-3 hover:bg-[#303030] cursor-pointer flex items-start gap-3 transition-colors relative group ${isUnread ? 'bg-[#1c1c1c]/30' : ''}`}
    >
      {isUnread && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#3ea6ff]" />
      )}

      <div className="flex-shrink-0 mt-0.5">
        <img 
          src={avatarSrc || `https://ui-avatars.com/api/?name=${encodeURIComponent(note.fromName || note.from || 'User')}&background=0D1117&color=ffffff&size=128`} 
          alt="channel-avatar" 
          className="w-10 h-10 rounded-full object-cover"
        />
      </div>

      <div className="flex flex-col min-w-0 pr-1">
        <p className="text-md tracking-tighter text-gray-100 leading-tighter line-clamp-2 break-words font-normal">
          <span className="text-gray-200">{note.fromName || note.from || 'Hệ thống'} đã tải lên: </span>
          {note.type === 'new_video' ? (note.title || 'đã tải lên') : (note.title || note.type)}
        </p>
        <span className="text-[12px] text-blue-300 -mt-3 inline-block">
          {time}
        </span>
      </div>

      {note.videoId && (
        <div className="ml-auto flex-shrink-0 w-20 h-12 rounded bg-zinc-800 overflow-hidden border-none">
          <img 
            src={thumbSrc} 
            alt="video-preview" 
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
    </div>
  );
};
