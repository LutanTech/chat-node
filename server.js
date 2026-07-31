console.log("SERVER LOADED", new Date().toISOString());
const { disconnect } = require("cluster");
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7,
    pingInterval: 10000,
    pingTimeout: 20000
});

const { initializeApp, cert } = require("firebase-admin/app");

const admin = require("firebase-admin");

const serviceAccount = require("./public/firebase-admin.json");

initializeApp({
    credential: cert(serviceAccount)
});

const animals = [
    "Lion", "Tiger", "Wolf", "Fox", "Falcon", "Panda", "Bear", "Eagle",
    "Hawk", "Jaguar", "Leopard", "Otter", "Rabbit", "Koala", "Raven",
    "Shark", "Whale", "Dolphin", "Cobra", "Python", "Moose", "Buffalo"
];

const users = {};
const allUsers = [];
let onlineUsers = [];
const directHistories = {};
const pinnedMessages = {};
const pendingDisconnects = {};
const DISCONNECT_GRACE_MS = 250;

function randomName() {
    return animals[Math.floor(Math.random() * animals.length)] + "-" + Math.floor(1000 + Math.random() * 9000);
}

function getChatKey(id1, id2) {
    return [id1, id2].sort().join("_");
}

function saveDirectMessage(chatKey, msg) {
    if (!directHistories[chatKey]) {
        directHistories[chatKey] = [];
    }
    directHistories[chatKey].push(msg);
    if (directHistories[chatKey].length > 100) {
        directHistories[chatKey].shift();
    }
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.json());

app.post("/api/register-fcm", (req, res) => {

    const { token, userId } = req.body;

    if (!token || !userId) {
        return res.status(400).json({
            success: false,
            message: "Missing token or userId"
        });
    }

    if (!users[userId]) {
        users[userId] = {
            id: userId
        };
    }

    users[userId].fcmToken = token;

    const user = allUsers.find(u => u.id === userId);

    if (user) {
        user.fcmToken = token;
    }

    console.log(`FCM token saved for ${userId}`);

    res.json({
        success: true
    });

});



async function sendPushNotification(token, title, body, data = {}) {

    try {

        await admin.messaging().send({

            token,

            data: {
                title,
                body,
                ...data
            },

            android: {
                priority: "high"
            }

        });

        console.log("Push sent");

    } catch (err) {

        console.error(err);

    }

}

io.on("connection", (socket) => {
    let currentUserId = null;
    let name = "";
    let expiresAt = null;
    let lastMessages = []

    socket.on("initSession", (clientSession) => {
        currentUserId = (clientSession && clientSession.userId) ? clientSession.userId : "usr_" + Math.random().toString(36).substring(2, 9);

        const isReconnecting = !!pendingDisconnects[currentUserId];

        if (isReconnecting) {
            clearTimeout(pendingDisconnects[currentUserId]);
            delete pendingDisconnects[currentUserId];
        }

        if (clientSession && clientSession.name && clientSession.expiresAt && Date.now() < clientSession.expiresAt) {
            name = clientSession.name;
            expiresAt = clientSession.expiresAt;
        } else if (users[currentUserId] && users[currentUserId].name) {
            name = users[currentUserId].name;
            expiresAt = users[currentUserId].expiresAt;
            broadcastUsers();
        } else {
            name = randomName();
            expiresAt = null;
        }

        users[currentUserId] = {
            id: currentUserId,
            socketId: socket.id,
            name,
            expiresAt,
            lastActive: Date.now()
        };


        const userObj = {
            id: currentUserId,
            socketId: socket.id,
            name,
            expiresAt,
            lastActive: Date.now()
        };

        allUsers.forEach(u=>{
        const chatKey = getChatKey(currentUserId, u.id);
        const history = directHistories[chatKey] || [];
        const lastMessage = history.length > 0 ? history[history.length - 1].text || 'Attachment' : 'Click to Message'
        const user = allUsers.find(u => u.id === u.id);

        user.lastMessage = lastMessage
        lastMessages.push({'msg':lastMessage, 'to':u.id})
        })
        
        const existingUser = allUsers.find(u => u.id === userObj.id);
        
        if (existingUser) {
            existingUser.lastActive = Date.now();
            existingUser.name = name;
        } else {
            allUsers.push(userObj);
        }


        
        socket.emit("sessionReady", {
            userId: currentUserId,
            name,
            expiresAt
        });

        if (!onlineUsers.some(u => u.id === currentUserId)) {
            onlineUsers.push({ id: currentUserId });
        }

        broadcastUsers();
        io.emit("lastMessages", {lastMessages});
    });


    socket.on("loadDirectHistory", ({ targetUserId }) => {
        if (!currentUserId || !targetUserId) return;
        const chatKey = getChatKey(currentUserId, targetUserId);
        const history = directHistories[chatKey] || [];
        const pinned = pinnedMessages[chatKey] || null;

        socket.emit("directHistoryLoaded", {
            targetUserId,
            history,
            pinned
        });
    });


    socket.on("loadUsers", () => {
        socket.emit("usersLoaded", {
            allUsers
        });
    });

    socket.on("updateSession", (data) => {
    
        expiresAt = data.expiresAt;
    
        if (currentUserId && allUsers[currentUserId]) {
            allUsers[currentUserId].expiresAt = data.expiresAt;
            users[currentUserId].expiresAt = data.expiresAt;
    
            if (data.newName) {
                allUsers[currentUserId].name = data.newName;
                users[currentUserId].name = data.newName;
            }
        }
    
        broadcastUsers();
    });

    socket.on("requestNewIdentity", () => {
        const oldName = name;
        name = randomName();
        expiresAt = null;

        if (currentUserId && users[currentUserId]) {
            users[currentUserId].name = name;
            users[currentUserId].expiresAt = null;
        }

        socket.emit("sessionReady", {
            userId: currentUserId,
            name,
            expiresAt: null,
            oldName : oldName
        });

        broadcastUsers();
    });

    socket.on("directMessage", async(payload) => {
        if (!payload || !payload.targetUserId) return;
        const targetUserId = payload.targetUserId;
        const text = typeof payload === 'string' ? payload.trim() : (payload.text || '').trim();
        const image = typeof payload === 'object' ? payload.image : null;
        const replyTo = typeof payload === 'object' && payload.replyTo ? payload.replyTo : null;

        if (!text && !image) return;

        const chatKey = getChatKey(currentUserId, targetUserId);
        const msg = {
            id: Date.now() + Math.random().toString(36).substring(2, 5),
            userId: currentUserId,
            targetUserId,
            name,
            text,
            image,
            replyTo: replyTo ? {
                id: replyTo.id,
                name: replyTo.name,
                text: replyTo.text,
                image: replyTo.image
            } : null,
            time: Date.now(),
            readBy: [],
            reactions: {},
            edited: false
        };

        saveDirectMessage(chatKey, msg);

        console.log('message sending', msg)

        socket.emit("directMessage", msg);

        const targetUser = users[targetUserId];

        if (targetUser?.fcmToken) {

            await sendPushNotification(
                targetUser.fcmToken,
                name,
                text || "Attachment",
                {
                    type: "message",
                    userId: currentUserId
                }
            );

        }

        if (targetUser) {
            io.to(targetUser.socketId).emit("directMessage", msg);
            io.emit("lastMessages", {lastMessages});

        }
    });

    socket.on("editMessage", ({ targetUserId, msgId, newText }) => {
        if (!currentUserId || !targetUserId || !msgId || !newText) return;
        const chatKey = getChatKey(currentUserId, targetUserId);
        const history = directHistories[chatKey] || [];
        const msg = history.find(m => m.id === msgId);

        if (msg && msg.userId === currentUserId) {
            msg.old_text = msg.text
            msg.text = newText.trim();
            msg.edited = true;
            msg.edited_at = new Date().toLocaleString();

            socket.emit("messageUpdated", { chatKey, msg });
            const targetUser = users[targetUserId];
            if (targetUser) {
                io.to(targetUser.socketId).emit("messageUpdated", { chatKey, msg });
            }
        }
    });

    socket.on("togglePinMessage", ({ targetUserId, msgId }) => {
        if (!currentUserId || !targetUserId) return;
        const chatKey = getChatKey(currentUserId, targetUserId);
        const history = directHistories[chatKey] || [];
        const msg = history.find(m => m.id === msgId);

        if (!msg) return;

        if (pinnedMessages[chatKey] && pinnedMessages[chatKey].id === msgId) {
            delete pinnedMessages[chatKey];
        } else {
            pinnedMessages[chatKey] = msg;
        }

        const currentPinned = pinnedMessages[chatKey] || null;

        socket.emit("pinnedUpdate", { chatKey, pinned: currentPinned });
        const targetUser = users[targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("pinnedUpdate", { chatKey, pinned: currentPinned });
        }
    });

    socket.on("markRead", ({ targetUserId, msgIds }) => {
        if (!Array.isArray(msgIds) || !currentUserId || !targetUserId) return;
        const chatKey = getChatKey(currentUserId, targetUserId);
        const history = directHistories[chatKey] || [];
        let updated = false;

        msgIds.forEach(msgId => {
            const msg = history.find(m => m.id === msgId);
            if (msg && msg.userId !== currentUserId) {
                if (!msg.readBy) msg.readBy = [];
                if (!msg.readBy.some(r => r.userId === currentUserId)) {
                    msg.readBy.push({
                        userId: currentUserId,
                        name,
                        time: Date.now()
                    });
                    updated = true;
                }
            }
        });

        if (updated) {
            socket.emit("directHistoryLoaded", {
                targetUserId,
                history,
                pinned: pinnedMessages[chatKey] || null
            });

            const targetUser = users[targetUserId];
            if (targetUser) {
                io.to(targetUser.socketId).emit("directHistoryLoaded", {
                    targetUserId: currentUserId,
                    history,
                    pinned: pinnedMessages[chatKey] || null
                });
            }
        }
    });

    socket.on("toggleReaction", ({ targetUserId, msgId, emoji }) => {
        if (!currentUserId || !targetUserId || !msgId || !emoji) return;
        const chatKey = getChatKey(currentUserId, targetUserId);
        const history = directHistories[chatKey] || [];
        const msg = history.find(m => m.id === msgId);

        if (msg) {
            if (!msg.reactions) msg.reactions = {};
            if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

            const existingIdx = msg.reactions[emoji].findIndex(r => r.userId === currentUserId);
            if (existingIdx > -1) {
                msg.reactions[emoji].splice(existingIdx, 1);
                if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
            } else {
                msg.reactions[emoji].push({ userId: currentUserId, name });
            }

            socket.emit("messageUpdated", { chatKey, msg });
            const targetUser = users[targetUserId];
            if (targetUser) {
                io.to(targetUser.socketId).emit("messageUpdated", { chatKey, msg });
            }
        }
    });

    socket.on("deleteMessage", ({ targetUserId, msgId }) => {
        if (!currentUserId || !targetUserId || !msgId) return;
        const chatKey = getChatKey(currentUserId, targetUserId);
        const history = directHistories[chatKey] || [];
        const index = history.findIndex(m => m.id === msgId);

        if (index > -1) {
            const targetMsg = history[index];
            if (targetMsg.userId === currentUserId) {
                history.splice(index, 1);
                if (pinnedMessages[chatKey] && pinnedMessages[chatKey].id === msgId) {
                    delete pinnedMessages[chatKey];
                }

                socket.emit("messageDeleted", { targetUserId, msgId });
                const targetUser = users[targetUserId];
                if (targetUser) {
                    io.to(targetUser.socketId).emit("messageDeleted", { targetUserId: currentUserId, msgId });
                }
            }
        }
    });

    socket.on("forwardMessage", async({ targetUserId, message }) => {

        const chatKey = getChatKey(currentUserId, targetUserId);
    
        const forwarded = {
            ...message,
            id: Date.now() + Math.random().toString(36).slice(2,5),
            userId: currentUserId,
            targetUserId,
            name,
            forwarded: true,
            time: Date.now(),
            readBy: [],
            reactions: {},
            edited: false
        };
    
        saveDirectMessage(chatKey, forwarded);
    
        socket.emit("directMessage", forwarded);
    
        const target = users[targetUserId];
        if (target) {
            io.to(target.socketId).emit("directMessage", forwarded);
        }
        if (target?.fcmToken) {

            await sendPushNotification(
                target.fcmToken,
                name,
                text || "Attachment",
                {
                    type: "message",
                    userId: currentUserId
                }
            );
        
        }
    });

    socket.on("callUser",  async(data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("incomingCall", {
                fromUserId: currentUserId,
                fromSocketId: socket.id,
                callerName: data.callerName,
                callType: data.callType,
                signal: data.signal
            });
            const token = fcmTokens.get(data.targetUserId);

            if (token) {

                await sendPushNotification(
                    token,
                    "Incoming Call",
                    data.callerName,
                    {
                        type: "call",
                        caller: data.callerName,
                        userId: currentUserId
                    }
                );

            }
        }
    });

    socket.on("acceptCall", (data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("callAccepted", {
                fromUserId: currentUserId,
                fromSocketId: socket.id,
                answererName: data.answererName,
                signal: data.signal
            });
        }
    });

    socket.on("rejectCall", (data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("callRejected", {
                byName: data.byName
            });
        }
    });

    socket.on("sendIceCandidate", (data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("iceCandidate", {
                candidate: data.candidate
            });
        }
    });

    socket.on("endCall", (data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("callEnded");
        }
    });

    socket.on("typing", ({ targetUserId }) => {
        const targetUser = users[targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("typing", { fromUserId: currentUserId, name });
        }
    });

    socket.on("stopTyping", ({ targetUserId }) => {
        const targetUser = users[targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("stopTyping", { fromUserId: currentUserId });
        }
    });


    socket.on("disconnect", () => {
        console.log('disconnecting...', currentUserId)

        if (!currentUserId) return;

        pendingDisconnects[currentUserId] = setTimeout(() => {
        
            onlineUsers = onlineUsers.filter(u => u.id !== currentUserId);
        
            delete users[currentUserId];
            delete pendingDisconnects[currentUserId];

            broadcastUsers();
        
            console.log("Disconnected:", currentUserId);
        }, DISCONNECT_GRACE_MS);

       
    });
});

function broadcastUsers() {
    io.emit("count", Object.keys(allUsers).length);
    io.emit("usersUpdate", allUsers);
    io.emit("onlineUpdate", onlineUsers);
    io.emit("usersLoaded", { allUsers });
}

const PORT = process.env.PORT || 9000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
});