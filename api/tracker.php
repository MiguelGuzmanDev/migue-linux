<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Configuración de rutas
$logsDir = __DIR__ . '/../logs';
$logFile = $logsDir . '/activity.log';
$jsonFile = $logsDir . '/views.json';
$ipCacheFile = $logsDir . '/cache_ips.json';
$timeLimitInSeconds = 3600; // Enfriamiento de 1 hora por IP

if (!is_dir($logsDir)) {
    mkdir($logsDir, 0755, true);
}

// Función para capturar IP real
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

$ip = getClientIP();

// 1. Obtención y saneamiento DIRECTO del parámetro page
$rawPage = $_GET['page'] ?? 'home';
// Permite letras, números, guiones y barras. Si viene vacío o inválido, asigna 'home'
$page = preg_replace('/[^a-zA-Z0-9_\-\/]/', '', $rawPage);
if (empty($page)) {
    $page = 'home';
}

$now = time();
$timestamp = date('Y-m-d H:i:s', $now);

// 2. Registrar siempre en activity.log para auditoría
$logEntry = sprintf("[%s] IP: %s | Page/Post: %s\n", $timestamp, $ip, $page);
file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);

// 3. Verificación de IP en caché (1 hora de límite por post)
$ipCache = [];
if (file_exists($ipCacheFile)) {
    $ipCacheData = file_get_contents($ipCacheFile);
    $ipCache = json_decode($ipCacheData, true) ?: [];
}

// Depurar marcas de tiempo viejas
foreach ($ipCache as $cacheKey => $lastVisitTime) {
    if (($now - $lastVisitTime) > $timeLimitInSeconds) {
        unset($ipCache[$cacheKey]);
    }
}

$visitKey = md5($ip . '_' . $page);
$isNewView = false;

if (!isset($ipCache[$visitKey]) || ($now - $ipCache[$visitKey]) >= $timeLimitInSeconds) {
    $isNewView = true;
    $ipCache[$visitKey] = $now;
    file_put_contents($ipCacheFile, json_encode($ipCache, JSON_PRETTY_PRINT), LOCK_EX);
}

// 4. Actualización de views.json
$viewsData = [
    'total' => 0,
    'pages' => []
];

if (file_exists($jsonFile)) {
    $content = file_get_contents($jsonFile);
    $viewsData = json_decode($content, true) ?: $viewsData;
}

if ($isNewView) {
    $viewsData['total'] = ($viewsData['total'] ?? 0) + 1;

    if (!isset($viewsData['pages'][$page])) {
        $viewsData['pages'][$page] = 0;
    }
    $viewsData['pages'][$page]++;

    file_put_contents($jsonFile, json_encode($viewsData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

// Responder JSON
echo json_encode([
    'status' => 'success',
    'is_new_view' => $isNewView,
    'total_views' => $viewsData['total'],
    'page_views' => $viewsData['pages'][$page] ?? 0,
    'current_page' => $page
]);
