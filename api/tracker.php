<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Configuración
$logsDir = __DIR__ . '/../logs';
$logFile = $logsDir . '/activity.log';
$jsonFile = $logsDir . '/views.json';
$ipCacheFile = $logsDir . '/cache_ips.json';
$timeLimitInSeconds = 3600; // 1 hora (3600 segundos)

// Crear la carpeta logs si no existe
if (!is_dir($logsDir)) {
    mkdir($logsDir, 0755, true);
}

// Obtener IP real del cliente
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

// Sanitizar y obtener el identificador del post/página
$ip = getClientIP();
$rawPage = $_GET['page'] ?? 'home';
// Normalizar el slug (elimina barras inclinadas y caracteres extraños)
$page = trim(parse_url($rawPage, PHP_URL_PATH), '/');
if (empty($page)) {
    $page = 'home';
}

$now = time();
$timestamp = date('Y-m-d H:i:s', $now);

// ----------------------------------------------------
// 1. Registrar SIEMPRE el evento en activity.log
// ----------------------------------------------------
$logEntry = sprintf("[%s] IP: %s | Page/Post: %s\n", $timestamp, $ip, $page);
file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);

// ----------------------------------------------------
// 2. Control de Frecuencia de IP (1 hora de enfriamiento)
// ----------------------------------------------------
$ipCache = [];
if (file_exists($ipCacheFile)) {
    $ipCacheData = file_get_contents($ipCacheFile);
    $ipCache = json_decode($ipCacheData, true) ?: [];
}

// Limpiar IPs viejas del caché (mayores a 1 hora) para que el archivo no crezca infinitamente
foreach ($ipCache as $cacheKey => $lastVisitTime) {
    if (($now - $lastVisitTime) > $timeLimitInSeconds) {
        unset($ipCache[$cacheKey]);
    }
}

// Clave única por combinación IP + Página
$visitKey = md5($ip . '_' . $page);
$isNewView = false;

// Verificar si la IP ya visitó ESTE post en la última hora
if (!isset($ipCache[$visitKey]) || ($now - $ipCache[$visitKey]) >= $timeLimitInSeconds) {
    $isNewView = true;
    $ipCache[$visitKey] = $now; // Actualizar timestamp de última visita
    file_put_contents($ipCacheFile, json_encode($ipCache, JSON_PRETTY_PRINT), LOCK_EX);
}

// ----------------------------------------------------
// 3. Cargar y actualizar views.json (solo si es nueva vista)
// ----------------------------------------------------
$viewsData = [
    'total' => 0,
    'pages' => []
];

if (file_exists($jsonFile)) {
    $content = file_get_contents($jsonFile);
    $viewsData = json_decode($content, true) ?: $viewsData;
}

if ($isNewView) {
    // Incrementar total general
    $viewsData['total'] = ($viewsData['total'] ?? 0) + 1;

    // Incrementar contador específico del post/página
    if (!isset($viewsData['pages'][$page])) {
        $viewsData['pages'][$page] = 0;
    }
    $viewsData['pages'][$page]++;

    // Guardar cambios en el JSON
    file_put_contents($jsonFile, json_encode($viewsData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

// Devolver el conteo actual en la respuesta
echo json_encode([
    'status' => 'success',
    'is_new_view' => $isNewView,
    'total_views' => $viewsData['total'],
    'page_views' => $viewsData['pages'][$page] ?? 0,
    'current_page' => $page
]);