@echo off
set PATH=C:\Windows\System32;C:\Windows;C:\Windows\System32\Wbem;C:\Program Files\PostgreSQL\18\bin
set SystemRoot=C:\Windows
set SystemDrive=C:
set TEMP=C:\Users\user\AppData\Local\Temp
set TMP=C:\Users\user\AppData\Local\Temp
set windir=C:\Windows
set PGDATA=C:\Users\user\Downloads\DELIVERY SYSTEM\.pgdata
"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\user\Downloads\DELIVERY SYSTEM\.pgdata" -l "C:\Users\user\Downloads\DELIVERY SYSTEM\pg-dev.log" -o "-p 5433 -h 127.0.0.1" start
