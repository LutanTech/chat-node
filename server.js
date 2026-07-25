const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const animals = [
    "Lion", "Tiger", "Wolf", "Fox", "Falcon", "Panda", "Bear", "Eagle",
    "Hawk", "Jaguar", "Leopard", "Otter", "Rabbit", "Koala", "Raven",
    "Shark", "Whale", "Dolphin", "Cobra", "Python", "Moose", "Buffalo"
];

const users = {};
const history = [];

function randomName() {
    return animals[Math.floor(Math.random() * animals.length)] + "-" + Math.floor(1000 + Math.random() * 9000);
}

function save(msg) {
    history.push(msg);
    if (history.length > 100) history.shift();
}

app.get("/", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-950 text-slate-100">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anonymous Chat - Session Persistence</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brand: {
                            500: '#6366f1',
                            600: '#4f46e5',
                            700: '#4338ca',
                        }
                    },
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                    }
                }
            }
        }
    </script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.6); }
        ::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.8); border-radius: 9999px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(71, 85, 105, 1); }
        .glass-panel {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        @keyframes popIn {
            0% { opacity: 0; transform: translateY(8px) scale(0.98); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-pop-in { animation: popIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes wave {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-5px); }
        }
        .dot-wave { animation: wave 1.3s infinite ease-in-out; }
        .dot-wave:nth-child(2) { animation-delay: 0.15s; }
        .dot-wave:nth-child(3) { animation-delay: 0.3s; }
    </style>
</head>
<body class="h-full flex flex-col font-sans antialiased selection:bg-brand-500 selection:text-white overflow-hidden">
    <div class="flex h-full w-full overflow-hidden bg-slate-950 relative">
        <div id="sidebar-overlay" onclick="toggleSidebar()" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-30 hidden lg:hidden transition-opacity"></div>
        <aside id="sidebar" class="fixed lg:relative z-40 inset-y-0 left-0 w-80 bg-slate-900/90 lg:bg-slate-900 border-r border-slate-800/80 flex flex-col transform -translate-x-full lg:translate-x-0 transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none">
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
                        <i class="fa-solid font-bold fa-user-ninja text-lg"></i>
                    </div>
                    <div>
                        <h1 class="font-bold text-slate-100 tracking-wide text-base flex items-center gap-2">AnonChat</h1>
                        <p class="text-xs text-slate-400">Encrypted & Anonymous</p>
                    </div>
                </div>
                <button onclick="toggleSidebar()" class="lg:hidden text-slate-400 hover:text-slate-200 p-2 rounded-lg hover:bg-slate-800">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>

            <div class="p-3.5 mx-3 my-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col gap-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5 overflow-hidden">
                        <div id="user-avatar" class="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold flex items-center justify-center text-xs shrink-0">
                            <i class="fa-solid fa-paw"></i>
                        </div>
                        <div class="truncate">
                            <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Your Identity</div>
                            <div id="my-username" class="text-sm font-semibold text-slate-100 truncate">Connecting...</div>
                        </div>
                    </div>
                    <button onclick="changeIdentity()" title="Generate New Identity" class="p-2 text-slate-400 hover:text-brand-400 hover:bg-slate-700/60 rounded-lg transition">
                        <i class="fa-solid fa-arrows-rotate text-xs"></i>
                    </button>
                </div>

                <div class="pt-2 border-t border-slate-700/50 flex flex-col gap-2">
                    <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                        <input type="checkbox" id="keep-session-cb" onchange="toggleKeepSession(this.checked)" class="w-3.5 h-3.5 rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-brand-500 accent-brand-600">
                        <span>Keep session for 3 hours</span>
                    </label>

                    <div id="session-countdown-wrapper" class="hidden flex items-center justify-between bg-slate-950/60 rounded-lg px-2.5 py-1.5 border border-slate-800 text-xs">
                        <div class="flex items-center gap-1.5 text-slate-400">
                            <i class="fa-regular fa-clock text-brand-400" id="timer-icon"></i>
                            <span id="countdown-timer" class="font-mono text-slate-200 font-medium">03:00:00</span>
                        </div>
                        <button onclick="extendSession()" title="Extend for 3 hours" class="px-2 py-0.5 rounded bg-brand-600/20 hover:bg-brand-600/40 text-brand-300 border border-brand-500/30 text-[11px] font-medium transition flex items-center gap-1">
                            <i class="fa-solid fa-plus text-[9px]"></i>
                            <span>Extend</span>
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto px-4 py-2 mt-1">
                <div class="flex items-center justify-between px-2 mb-2">
                    <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Users</div>
                    <span id="user-count-badge" class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-emerald-400 border border-slate-700">0</span>
                </div>
                <div id="online-users-list" class="space-y-1"></div>
            </div>
            <div class="p-3 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between text-xs text-slate-400">
                <button onclick="toggleAudio()" id="sound-btn" class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-slate-200 transition">
                    <i class="fa-solid fa-volume-high text-brand-400" id="sound-icon"></i>
                    <span id="sound-text">Sound On</span>
                </button>
            </div>
        </aside>

        <main class="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden">
            <header class="h-16 px-4 lg:px-6 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-between shrink-0 z-10">
                <div class="flex items-center gap-3">
                    <button onclick="toggleSidebar()" class="lg:hidden text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition">
                        <i class="fa-solid fa-bars text-lg"></i>
                    </button>
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="font-bold text-slate-100 text-base"># global-chat</h2>
                            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                Live
                            </span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="clearMessagesUI()" title="Clear View" class="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition">
                        <i class="fa-solid fa-trash-can text-sm"></i>
                    </button>
                </div>
            </header>

            <div id="messages-container" class="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
                <div class="max-w-md mx-auto text-center py-6 px-4 my-2 rounded-2xl glass-panel border border-slate-800">
                    <div class="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/30 text-brand-400 flex items-center justify-center mx-auto mb-3 text-xl">
                        <i class="fa-solid fa-shield-cat"></i>
                    </div>
                    <h3 class="text-slate-100 font-semibold text-sm mb-1">Welcome to Anonymous Chat</h3>
                    <p class="text-xs text-slate-400 leading-relaxed">Check "Keep session for 3 hours" to maintain your identity even across browser reloads.</p>
                </div>
                <div id="messages" class="space-y-3 max-w-4xl mx-auto"></div>
            </div>

            <div id="typing-indicator" class="h-6 px-6 text-xs text-slate-400 flex items-center gap-2 italic transition-all duration-200 opacity-0 pointer-events-none">
                <div class="flex items-center gap-1">
                    <span class="w-1.5 h-1.5 bg-brand-400 rounded-full dot-wave"></span>
                    <span class="w-1.5 h-1.5 bg-brand-400 rounded-full dot-wave"></span>
                    <span class="w-1.5 h-1.5 bg-brand-400 rounded-full dot-wave"></span>
                </div>
                <span id="typing-text">Someone is typing...</span>
            </div>

            <footer class="p-3 lg:p-4 bg-slate-900/80 border-t border-slate-800/80 backdrop-blur-md relative shrink-0">
                <div class="max-w-4xl mx-auto">
                    <div id="emoji-picker" class="hidden absolute bottom-full left-4 mb-2 p-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl flex items-center gap-1.5 z-20">
                        <button onclick="addEmoji('👍')" class="p-2 hover:bg-slate-700 rounded-lg text-base">👍</button>
                        <button onclick="addEmoji('❤️')" class="p-2 hover:bg-slate-700 rounded-lg text-base">❤️</button>
                        <button onclick="addEmoji('😂')" class="p-2 hover:bg-slate-700 rounded-lg text-base">😂</button>
                        <button onclick="addEmoji('🔥')" class="p-2 hover:bg-slate-700 rounded-lg text-base">🔥</button>
                        <button onclick="addEmoji('🎉')" class="p-2 hover:bg-slate-700 rounded-lg text-base">🎉</button>
                        <button onclick="addEmoji('🚀')" class="p-2 hover:bg-slate-700 rounded-lg text-base">🚀</button>
                    </div>
                    <form id="chat-form" onsubmit="handleSend(event)" class="flex items-center gap-2">
                        <div class="relative flex-1 flex items-center">
                            <button type="button" onclick="toggleEmojiPicker()" class="absolute left-3 text-slate-400 hover:text-slate-200 transition p-1">
                                <i class="fa-regular fa-face-smile text-lg"></i>
                            </button>
                            <input id="msg-input" type="text" placeholder="Type a message anonymously..." autocomplete="off" class="w-full bg-slate-950 text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-11 pr-4 py-3 border border-slate-800 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition shadow-inner">
                        </div>
                        <button type="submit" id="send-btn" class="px-5 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-brand-500/20 flex items-center gap-2 shrink-0">
                            <span>Send</span>
                            <i class="fa-solid fa-paper-plane text-xs"></i>
                        </button>
                    </form>
                </div>
            </footer>
        </main>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let myUsername = "";
        let expiresAt = null;
        let countdownTimer = null;
        let audioEnabled = true;
        let typingTimeout = null;
        let onlineUsers = [];

        const SESSION_DURATION = 3 * 60 * 60 * 1000;
        const STORAGE_KEY = "anonchat_session_data";

        const avatarColors = [
            'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
            'bg-amber-500/20 text-amber-400 border-amber-500/30',
            'bg-rose-500/20 text-rose-400 border-rose-500/30',
            'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
            'bg-purple-500/20 text-purple-400 border-purple-500/30'
        ];

        function playNotificationSound(type = 'message') {
            if (!audioEnabled) return;
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                if (type === 'message') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.08, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.15);
                } else if (type === 'system') {
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(440, ctx.currentTime);
                    gain.gain.setValueAtTime(0.04, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.2);
                }
            } catch(e) {}
        }

        function getAvatarStyle(name) {
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
            return avatarColors[Math.abs(hash) % avatarColors.length];
        }

        function getAvatarIcon(name) {
            return (name.split('-')[0] || name).charAt(0).toUpperCase();
        }

        function loadSavedSession() {
            try {
                const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (data && data.expiresAt && Date.now() < data.expiresAt) {
                    return data;
                }
                localStorage.removeItem(STORAGE_KEY);
            } catch(e) {}
            return null;
        }

        socket.on('connect', () => {
            const saved = loadSavedSession();
            socket.emit('initSession', saved);
        });

        socket.on('sessionReady', (data) => {
            myUsername = data.name;
            expiresAt = data.expiresAt;
            updateMyIdentityUI();

            document.getElementById('messages').innerHTML = '';
            if (data.history) data.history.forEach(addMessageUI);

            if (expiresAt && Date.now() < expiresAt) {
                document.getElementById('keep-session-cb').checked = true;
                startCountdownUI();
            } else {
                document.getElementById('keep-session-cb').checked = false;
                stopCountdownUI();
            }
        });

        socket.on('message', (msg) => {
            addMessageUI(msg);
            if (msg.name !== myUsername) playNotificationSound('message');
        });

        socket.on('system', (text) => {
            addSystemMessageUI(text);
            playNotificationSound('system');
        });

        socket.on('count', (count) => {
            document.getElementById('user-count-badge').innerText = count;
        });

        socket.on('usersUpdate', (users) => {
            onlineUsers = users;
            renderOnlineUsers();
        });

        socket.on('typing', (name) => {
            const indicator = document.getElementById('typing-indicator');
            document.getElementById('typing-text').innerText = name + ' is typing...';
            indicator.classList.remove('opacity-0');
        });

        socket.on('stopTyping', () => {
            document.getElementById('typing-indicator').classList.add('opacity-0');
        });

        const input = document.getElementById('msg-input');
        input.addEventListener('input', () => {
            socket.emit('typing');
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => socket.emit('stopTyping'), 1200);
        });

        function toggleKeepSession(enabled) {
            if (enabled) {
                expiresAt = Date.now() + SESSION_DURATION;
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: myUsername, expiresAt }));
                socket.emit('updateSession', { expiresAt });
                startCountdownUI();
                addSystemMessageUI("Session persistence activated for 3 hours.");
            } else {
                expiresAt = null;
                localStorage.removeItem(STORAGE_KEY);
                socket.emit('updateSession', { expiresAt: null });
                stopCountdownUI();
                addSystemMessageUI("Session persistence deactivated.");
            }
        }

        function extendSession() {
            expiresAt = Date.now() + SESSION_DURATION;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: myUsername, expiresAt }));
            socket.emit('updateSession', { expiresAt });
            startCountdownUI();
            addSystemMessageUI("Identity session extended for another 3 hours!");
        }

        function startCountdownUI() {
            document.getElementById('session-countdown-wrapper').classList.remove('hidden');
            clearInterval(countdownTimer);
            updateTimerDisplay();
            countdownTimer = setInterval(updateTimerDisplay, 1000);
        }

        function stopCountdownUI() {
            document.getElementById('session-countdown-wrapper').classList.add('hidden');
            clearInterval(countdownTimer);
        }

        function updateTimerDisplay() {
            if (!expiresAt) return stopCountdownUI();
            const diff = expiresAt - Date.now();
            if (diff <= 0) {
                stopCountdownUI();
                localStorage.removeItem(STORAGE_KEY);
                addSystemMessageUI("Your 3-hour session expired. Requesting new identity...");
                changeIdentity();
                return;
            }

            const hrs = Math.floor(diff / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            const display = String(hrs).padStart(2, '0') + ':' + 
                            String(mins).padStart(2, '0') + ':' + 
                            String(secs).padStart(2, '0');
            
            const timerElem = document.getElementById('countdown-timer');
            const timerIcon = document.getElementById('timer-icon');
            timerElem.innerText = display;

            if (diff <= 5 * 60 * 1000) {
                timerElem.className = "font-mono text-amber-400 font-bold animate-pulse";
                timerIcon.className = "fa-solid fa-triangle-exclamation text-amber-400 animate-bounce";
            } else {
                timerElem.className = "font-mono text-slate-200 font-medium";
                timerIcon.className = "fa-regular fa-clock text-brand-400";
            }
        }

        function changeIdentity() {
            socket.emit('requestNewIdentity');
            if (document.getElementById('keep-session-cb').checked) {
                setTimeout(() => {
                    expiresAt = Date.now() + SESSION_DURATION;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: myUsername, expiresAt }));
                    socket.emit('updateSession', { expiresAt });
                    startCountdownUI();
                }, 200);
            }
        }

        function updateMyIdentityUI() {
            document.getElementById('my-username').innerText = myUsername;
            const avatar = document.getElementById('user-avatar');
            avatar.className = 'w-9 h-9 rounded-full font-bold flex items-center justify-center text-xs shrink-0 border ' + getAvatarStyle(myUsername);
            avatar.innerText = getAvatarIcon(myUsername);
        }

        function renderOnlineUsers() {
            const container = document.getElementById('online-users-list');
            document.getElementById('user-count-badge').innerText = onlineUsers.length;
            container.innerHTML = onlineUsers.map(u => {
                const isMe = u.name === myUsername;
                return '<div class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 transition group"><div class="flex items-center gap-2.5 overflow-hidden"><div class="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 border ' + getAvatarStyle(u.name) + '">' + getAvatarIcon(u.name) + '</div><span class="text-xs text-slate-300 font-medium truncate ' + (isMe ? 'text-brand-400 font-semibold' : '') + '">' + escapeHTML(u.name) + (isMe ? ' (You)' : '') + '</span></div><span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span></div>';
            }).join('');
        }

        function addMessageUI(data) {
            const container = document.getElementById('messages');
            const isMe = data.name === myUsername;
            const timeStr = new Date(data.time || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const msgElement = document.createElement('div');
            msgElement.className = 'flex gap-3 animate-pop-in ' + (isMe ? 'flex-row-reverse' : 'flex-row');
            msgElement.innerHTML = '<div class="w-8 h-8 rounded-full ' + getAvatarStyle(data.name) + ' font-bold text-xs flex items-center justify-center shrink-0 border mt-1 shadow-sm">' + getAvatarIcon(data.name) + '</div><div class="max-w-[82%] sm:max-w-[70%]"><div class="flex items-center gap-2 mb-1 px-1 ' + (isMe ? 'justify-end' : 'justify-start') + '"><span class="text-xs font-medium text-slate-400 ' + (isMe ? 'text-brand-400' : '') + '">' + escapeHTML(isMe ? 'You' : data.name) + '</span><span class="text-[10px] text-slate-500">' + timeStr + '</span></div><div class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words shadow-md ' + (isMe ? 'bg-brand-600 text-white rounded-tr-none' : 'bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-tl-none') + '">' + escapeHTML(data.text) + '</div></div>';
            container.appendChild(msgElement);
            scrollToBottom();
        }

        function addSystemMessageUI(text) {
            const container = document.getElementById('messages');
            const div = document.createElement('div');
            div.className = "flex justify-center my-2 animate-pop-in";
            div.innerHTML = '<div class="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-400 font-medium inline-flex items-center gap-1.5 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-brand-400"></span><span>' + escapeHTML(text) + '</span></div>';
            container.appendChild(div);
            scrollToBottom();
        }

        function handleSend(e) {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;
            socket.emit('message', text);
            socket.emit('stopTyping');
            input.value = '';
            document.getElementById('emoji-picker').classList.add('hidden');
        }

        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
            document.getElementById('sidebar-overlay').classList.toggle('hidden');
        }

        function toggleAudio() {
            audioEnabled = !audioEnabled;
            document.getElementById('sound-icon').className = audioEnabled ? "fa-solid fa-volume-high text-brand-400" : "fa-solid fa-volume-xmark text-slate-500";
            document.getElementById('sound-text').innerText = audioEnabled ? "Sound On" : "Muted";
        }

        function toggleEmojiPicker() {
            document.getElementById('emoji-picker').classList.toggle('hidden');
        }

        function addEmoji(emoji) {
            input.value += emoji;
            input.focus();
            document.getElementById('emoji-picker').classList.add('hidden');
        }

        function clearMessagesUI() {
            document.getElementById('messages').innerHTML = '';
        }

        function scrollToBottom() {
            const container = document.getElementById('messages-container');
            container.scrollTop = container.scrollHeight;
        }

        function escapeHTML(str) {
            return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
        }
    </script>
</body>
</html>`);
});

io.on("connection", (socket) => {
    let name = "";
    let expiresAt = null;

    socket.on("initSession", (clientSession) => {
        if (clientSession && clientSession.name && clientSession.expiresAt && Date.now() < clientSession.expiresAt) {
            name = clientSession.name;
            expiresAt = clientSession.expiresAt;
        } else {
            name = randomName();
            expiresAt = null;
        }

        users[socket.id] = { id: socket.id, name, expiresAt };

        socket.emit("sessionReady", { name, expiresAt, history });
        io.emit("count", Object.keys(users).length);
        io.emit("usersUpdate", Object.values(users));
        io.emit("system", `${name} joined the room`);
    });

    socket.on("updateSession", (data) => {
        expiresAt = data ? data.expiresAt : null;
        if (users[socket.id]) {
            users[socket.id].expiresAt = expiresAt;
        }
    });

    socket.on("requestNewIdentity", () => {
        const oldName = name;
        name = randomName();
        expiresAt = null;
        if (users[socket.id]) {
            users[socket.id].name = name;
            users[socket.id].expiresAt = null;
        }
        socket.emit("sessionReady", { name, expiresAt: null, history: [] });
        io.emit("usersUpdate", Object.values(users));
        io.emit("system", `${oldName} changed identity to ${name}`);
    });

    socket.on("message", (text) => {
        if (!text || !text.trim()) return;
        const msg = {
            id: Date.now() + Math.random().toString(36).substring(2, 5),
            name,
            text: text.trim(),
            time: Date.now()
        };
        save(msg);
        io.emit("message", msg);
    });

    socket.on("typing", () => {
        socket.broadcast.emit("typing", name);
    });

    socket.on("stopTyping", () => {
        socket.broadcast.emit("stopTyping");
    });

    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("count", Object.keys(users).length);
        io.emit("usersUpdate", Object.values(users));
        io.emit("system", `${name} left the room`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});