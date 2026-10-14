param([int]$Port = 8080)

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "Server started at $prefix"
} catch {
    $Port = 8085
    $listener = New-Object System.Net.HttpListener
    $prefix = "http://localhost:$Port/"
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    Write-Host "Server started at $prefix"
}

$root = $PSScriptRoot

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # CORS headers
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.OutputStream.Close()
            continue
        }

        $path = $request.Url.LocalPath

        # API Endpoints
        if ($path -eq "/api/save-log" -and $request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()
            $logPath = Join-Path $root "csampazo_naplo.txt"
            [System.IO.File]::WriteAllText($logPath, $body, [System.Text.Encoding]::UTF8)
            $response.ContentType = "application/json; charset=utf-8"
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success":true}')
            $response.ContentLength64 = $respBytes.Length
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.OutputStream.Close()
            continue
        }

        if ($path -eq "/api/get-log" -and $request.HttpMethod -eq "GET") {
            $logPath = Join-Path $root "csampazo_naplo.txt"
            $content = ""
            if (Test-Path $logPath) {
                $content = [System.IO.File]::ReadAllText($logPath, [System.Text.Encoding]::UTF8)
            }
            $response.ContentType = "text/plain; charset=utf-8"
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($content)
            $response.ContentLength64 = $respBytes.Length
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.OutputStream.Close()
            continue
        }

        if ($path -eq "/api/save-routes" -and $request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()
            $routesPath = Join-Path $root "csampazo_utvonalak.txt"
            [System.IO.File]::WriteAllText($routesPath, $body, [System.Text.Encoding]::UTF8)
            $response.ContentType = "application/json; charset=utf-8"
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success":true}')
            $response.ContentLength64 = $respBytes.Length
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.OutputStream.Close()
            continue
        }

        if ($path -eq "/api/get-routes" -and $request.HttpMethod -eq "GET") {
            $routesPath = Join-Path $root "csampazo_utvonalak.txt"
            $content = ""
            if (Test-Path $routesPath) {
                $content = [System.IO.File]::ReadAllText($routesPath, [System.Text.Encoding]::UTF8)
            }
            $response.ContentType = "text/plain; charset=utf-8"
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($content)
            $response.ContentLength64 = $respBytes.Length
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.OutputStream.Close()
            continue
        }

        if ($path -eq "/api/status") {
            $response.ContentType = "application/json; charset=utf-8"
            $json = '{"running":true,"app":"Csampazo"}'
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentLength64 = $respBytes.Length
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.OutputStream.Close()
            continue
        }

        # Static files
        if ($path -eq "/" -or $path -eq "") {
            $path = "/index.html"
        }

        $path = $path.TrimStart('/')
        $localPath = Join-Path $root $path

        if (Test-Path $localPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            switch ($ext) {
                ".html" { $response.ContentType = "text/html; charset=utf-8" }
                ".css"  { $response.ContentType = "text/css; charset=utf-8" }
                ".js"   { $response.ContentType = "application/javascript; charset=utf-8" }
                ".json" { $response.ContentType = "application/json; charset=utf-8" }
                ".webmanifest" { $response.ContentType = "application/manifest+json; charset=utf-8" }
                ".png"  { $response.ContentType = "image/png" }
                ".svg"  { $response.ContentType = "image/svg+xml" }
                ".txt"  { $response.ContentType = "text/plain; charset=utf-8" }
                ".apk"  { $response.ContentType = "application/vnd.android.package-archive" }
                default { $response.ContentType = "application/octet-stream" }
            }

            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("File not found")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.OutputStream.Close()
    } catch {
        # ignore disconnects
    }
}
