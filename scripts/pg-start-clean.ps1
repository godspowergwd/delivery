$bin = 'C:\Program Files\PostgreSQL\18\bin'
$data = 'C:\Users\user\Downloads\DELIVERY SYSTEM\.pgdata'
$log = 'C:\Users\user\Downloads\DELIVERY SYSTEM\pg-dev.log'
$args = '-D "{0}" -l "{1}" -o "-p 5433 -h 127.0.0.1" start' -f $data, $log
Start-Process -FilePath "$bin\pg_ctl.exe" -ArgumentList $args -WorkingDirectory 'C:\Users\user\Downloads\DELIVERY SYSTEM' -UseNewEnvironment -WindowStyle Hidden
Start-Sleep -Seconds 8
& "$bin\pg_ctl.exe" -D $data status
