@echo off
cd /d "d:\Vibe Working\projects\bot-forward-docs"
if not exist logs mkdir logs
npm start >> logs\bot.log 2>&1
