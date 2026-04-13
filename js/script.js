const tg = window.Telegram.WebApp;
tg.expand();

let currentCommandPrefix = "";
let codeReader = null;
let lastScannedCode = "";
let matchCount = 0;
let pendingCommand = "";

// Инициализация Биометрии
tg.BiometricManager.init();

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Кнопка отмены внутри сканера
const scannerBackBtn = document.getElementById('scanner-back-btn');
if (scannerBackBtn) {
    scannerBackBtn.addEventListener('click', () => {
        stopScanner();
        showScreen('main-menu-screen');
    });
}

function startScanner(cmdType, titleText) {
    showScreen('scanner-screen');
    document.getElementById('scanner-title').innerText = titleText;

    // Добавили sign в список команд без префикса
    currentCommandPrefix = (cmdType === 'auth' || cmdType === 'verifyZO' || cmdType === 'sign') ? "" : "/" + cmdType + " ";
    lastScannedCode = "";
    matchCount = 0;

    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.QR_CODE, ZXing.BarcodeFormat.CODE_128, 
        ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.EAN_13
    ]);

    codeReader = new ZXing.BrowserMultiFormatReader(hints);
    
    codeReader.decodeFromConstraints({ audio: false, video: { facingMode: "environment" } }, 'video', (result, err) => {
        if (result) {
            let text = result.text;
            if (text === lastScannedCode) {
                matchCount++;
                // ВТОРОЙ КАДР УСПЕШЕН - ИДЕМ ДАЛЬШЕ
                if (matchCount >= 2) {
                    processScanResult(cmdType, text);
                }
            } else { 
                // ПЕРВЫЙ КАДР - АНИМАЦИЯ
                lastScannedCode = text; 
                matchCount = 0; 
                
                const viewfinder = document.getElementById('viewfinder');
                viewfinder.classList.add('found');
                
                // Если код потерялся, возвращаем рамку обратно
                setTimeout(() => {
                    if (matchCount < 2 && viewfinder) {
                        viewfinder.classList.remove('found');
                    }
                }, 400);
            }
        }
        if (err && !(err instanceof ZXing.NotFoundException)) {
            console.error(err);
        }
    }).catch(err => {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
             alert("Разрешите доступ к камере в настройках.");
        } else {
             console.log("Ошибка камеры: " + err);
        }
    });
}

function processScanResult(cmdType, text) {
    let payload = text;
    
    // 1. Вытаскиваем нужный кусок из QR-кода (если это сложная ссылка)
    if (cmdType === 'auth' || cmdType === 'verifyZO' || cmdType === 'sign') {
        if (text.includes('start=')) payload = text.split('start=')[1].split('&')[0];
        else if (text.includes(cmdType + '_')) payload = text.substring(text.indexOf(cmdType + '_'));
        pendingCommand = "/start " + payload;
    } else {
        pendingCommand = currentCommandPrefix + text;
    }
    
    stopScanner();

    // 2. Решаем, нужна ли биометрия перед отправкой
    if (cmdType === 'auth' || cmdType === 'sign') {
        // Биометрия НУЖНА только для входа и подписания
        verifyUserWithSystem();
    } else {
        // Для Отгрузки (verifyZO), товаров и ячеек отправляем сразу!
        finishAuth();
    }
}

function verifyUserWithSystem() {
    if (tg.BiometricManager.isBiometricAvailable) {
        if (!tg.BiometricManager.accessGranted) {
            tg.BiometricManager.requestAccess({ reason: "Для выполнения операции требуется подтверждение" }, (accessGranted) => {
                if (accessGranted) { callSystemAuth(); } else {
                    alert("Вы запретили доступ. Операция отменена.");
                    showScreen('main-menu-screen');
                }
            });
        } else { callSystemAuth(); }
    } else { finishAuth(); }
}

function callSystemAuth() {
    tg.BiometricManager.authenticate({ reason: "Подтвердите операцию" }, (success) => {
        if (success) { finishAuth(); } else {
            alert("Проверка не пройдена.");
            showScreen('main-menu-screen');
        }
    });
}

function finishAuth() {
    tg.sendData(pendingCommand);
    tg.close();
}

function stopScanner() { 
    if (codeReader) codeReader.reset(); 
    // Сбрасываем анимацию рамки при выходе
    const viewfinder = document.getElementById('viewfinder');
    if (viewfinder) viewfinder.classList.remove('found');
}