@echo off
rem Atualiza as comissões do Decision no portal (usado pela tarefa agendada do Windows a cada 30 minutos).
rem O resultado de cada execução fica em logs\sync-decision.log (pasta fora do Git).
cd /d "%~dp0.."
if not exist logs mkdir logs
"C:\Program Files\nodejs\node.exe" scripts\sync-decision.ts >> logs\sync-decision.log 2>&1
