#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd ~/stream-site-v2
pkill -9 -f server.py 2>/dev/null
sleep 1
nohup python3 server.py 3002 > server.log 2>&1 &
echo "Serveur démarré (PID $!) sur :3002"
