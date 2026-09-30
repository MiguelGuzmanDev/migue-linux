<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Definir rutas de la carpeta logs y sus archivos
$logsDir = __DIR__ . '/../logs';
$logFile = $logsDir . '/activity.log';
$jsonFile = $logsDir . '/views.json';

// Crear la carpeta logs si no existe
if (!is_dir($logsDir)) {
    mkdir($logsDir, 0755, true);
}

// Función para obtener la IP real del cliente (incluso tras Nginx, Cloudflare o proxy)
function getClientIP() {
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        return $_SERVER['HTTP_CF_CONNECTING_IP'];
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ipList = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ipList[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// Datos de la visita
$ip = getClientIP();
$page = isset($_GET['page']) && !empty($_GET['page']) ? filter_var($_GET['page'], FILTER_SANITIZE_URL) : 'home';
$timestamp = date('Y-m-d H:i:s');

// ----------------------------------------------------
// A. Registrar IP y recurso en logs/activity.log
// ----------------------------------------------------
$logEntry = sprintf("[%s] IP: %s | Page/Post: %s\n", $timestamp, $ip, $page);
file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);

// ----------------------------------------------------
// B. Actualizar contadores en logs/views.json
// ----------------------------------------------------
$viewsData = [
    'total' => 0,
    'pages' => []
];

// Cargar estado si views.json ya existe
if (file_exists($jsonFile)) {
    $content = file_get_contents($jsonFile);
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        $viewsData = $decoded;
    }
}

// Incrementar contador total
$viewsData['total'] = ($viewsData['total'] ?? 0) + 1;

// Incrementar contador de la página/post específica
if (!isset($viewsData['pages'][$page])) {
    $viewsData['pages'][$page] = 0;
}
$viewsData['pages'][$page]++;

// Guardar de forma atómica en el JSON con bloqueo para evitar colisiones
file_put_contents($jsonFile, json_encode($viewsData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);

// Devolver la respuesta JSON al frontend
echo json_encode([
    'status' => 'success',
    'total_views' => $viewsData['total'],
    'page_views' => $viewsData['pages'][$page]
]);