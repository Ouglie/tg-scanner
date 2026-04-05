/* Переносим всю логику в отдельный файл */

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

// Устанавливаем обработчик для кнопки "Отмена" внутри сканера
const scannerBackBtn = document.getElementById('scanner-back-btn');
if (scannerBackBtn) {
    scannerBackBtn.addEventListener('click', () => {
        stopScanner();
        showScreen('main-menu-screen');
    });
}

function startScanner(cmdType, titleText) {
    showScreen('scanner-screen');
    const titleElement = document.getElementById('scanner-title');
    if (titleElement) titleElement.innerText = titleText;

    currentCommandPrefix = (cmdType === 'auth' || cmdType === 'verifyZO') ? "" : "/" + cmdType + " ";
    lastScannedCode = "";
    matchCount = 0;

    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.QR_CODE, ZXing.BarcodeFormat.CODE_128, 
        ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.EAN_13
    ]);

    codeReader = new ZXing.BrowserMultiFormatReader(hints);
    
    // ПРОВЕРКА ДЛЯ УСТРАНЕНИЯ ОШИБКИ, ЕСЛИ ВИДЕО FEED ЕЩЕ НЕ ГОТОВ
    codeReader.decodeFromConstraints({ audio: false, video: { facingMode: "environment" } }, 'video', (result, err) => {
        if (result) {
            let text = result.text;
            if (text === lastScannedCode) {
                matchCount++;
                if (matchCount >= 2) {
                    processScanResult(cmdType, text);
                }
            } else { lastScannedCode = text; matchCount = 0; }
        }
        if (err && !(err instanceof ZXing.NotFoundException)) {
            // ZXing часто кидает NotFoundException, это нормально, пока код не найден.
            // Нам важны только другие ошибки (например, доступ к камере).
            console.error(err);
        }
    }).catch(err => {
        // Ловим ошибку доступа к камере на iOS
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
             alert("Mini App не имеет доступа к камере. Разрешите доступ в настройках Telegram.");
        } else {
             console.log("Ошибка камеры: " + err);
        }
    });
}

function processScanResult(cmdType, text) {
    let payload = text;
    if (cmdType === 'auth' || cmdType === 'verifyZO') {
        if (text.includes('start=')) payload = text.split('start=')[1].split('&')[0];
        else if (text.includes(cmdType + '_')) payload = text.substring(text.indexOf(cmdType + '_'));
        pendingCommand = "/start " + payload;
        
        stopScanner();
        verifyUserWithSystem();
    } else {
        pendingCommand = currentCommandPrefix + text;
        stopScanner();
        finishAuth();
    }
}

function verifyUserWithSystem() {
    if (tg.BiometricManager.isBiometricAvailable) {
        if (!tg.BiometricManager.accessGranted) {
            tg.BiometricManager.requestAccess({ reason: "Для входа в WMS требуется подтверждение личности" }, (accessGranted) => {
                if (accessGranted) { callSystemAuth(); } else {
                    alert("Вы запретили доступ. Авторизация отменена.");
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

function stopScanner() { if (codeReader) codeReader.reset(); }
