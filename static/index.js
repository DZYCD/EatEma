const MODE_NORMAL = 1, MODE_ENDLESS = 2, MODE_PRACTICE = 3;

(function(w) {
    function getJsonI18N() {
        // https://developer.mozilla.org/zh-CN/docs/Web/API/Navigator/language
        
        const LANGUAGES = [
            { regex: /^zh\b/, lang: 'zh' },
            { regex: /^ja\b/, lang: 'ja' },
            { regex: /.*/, lang: 'en'}
        ]

        const lang = LANGUAGES.find(l => l.regex.test(navigator.language)).lang
        
        return $.ajax({
            url: `./static/i18n/${lang}.json?v=2.2`,
            dataType: 'json',
            method: 'GET',
            async: false,
            success: data => res = data,
            error: () => alert('找不到语言文件: ' + lang)
        }).responseJSON
    }

    const I18N = getJsonI18N()

    $('[data-i18n]').each(function() {
        const content = I18N[this.dataset.i18n];
        $(this).text(content);
    });

    $('[data-placeholder-i18n]').each(function() {
        $(this).attr('placeholder', I18N[this.dataset.placeholderI18n]);
    });

    $('html').attr('lang', I18N['lang']);

    let isDesktop = !navigator['userAgent'].match(/(ipad|iphone|ipod|android|windows phone)/i);
    let fontunit = isDesktop ? 20 : ((window.innerWidth > window.innerHeight ? window.innerHeight : window.innerWidth) / 320) * 10;
    document.write('<style type="text/css">' +
        'html,body {font-size:' + (fontunit < 30 ? fontunit : '30') + 'px;}' +
        (isDesktop ? '#welcome,#GameTimeLayer,#GameLayerBG,#GameScoreLayer.SHADE{position: absolute;}' :
            '#welcome,#GameTimeLayer,#GameLayerBG,#GameScoreLayer.SHADE{position:fixed;}@media screen and (orientation:landscape) {#landscape {display: box; display: -webkit-box; display: -moz-box; display: -ms-flexbox;}}') +
        '</style>');
    let map = {'d': 1, 'f': 2, 'j': 3, 'k': 4};
    if (isDesktop) {
        document.write('<div id="gameBody">');
        document.onkeydown = function (e) {
            let key = e.key.toLowerCase();
            if (Object.keys(map).indexOf(key) !== -1) {
                click(map[key])
            }
        }
    }

    let body, blockSize, GameLayer = [],
        GameLayerBG, touchArea = [],
        GameTimeLayer;
    let transform, transitionDuration, welcomeLayerClosed;

    let mode = getMode();

    let soundMode = getSoundMode();
    let currentSoundPreset = getSoundPreset();
    let currentImagePreset = getImagePreset();
    let currentNotePattern = getNotePattern();

    w.init = function() {
        // 设置随机背景
        setRandomBackground();
        
        showWelcomeLayer();
        body = document.getElementById('gameBody') || document.body;
        body.style.height = window.innerHeight + 'px';
        
        // 初始化时间滑块
        setTimeout(() => {
            initTimeSlider();
        }, 100);
        
        transform = typeof (body.style.webkitTransform) != 'undefined' ? 'webkitTransform' : (typeof (body.style.msTransform) !=
        'undefined' ? 'msTransform' : 'transform');
        transitionDuration = transform.replace(/ransform/g, 'ransitionDuration');
        GameTimeLayer = document.getElementById('GameTimeLayer');
        GameLayer.push(document.getElementById('GameLayer1'));
        GameLayer[0].children = GameLayer[0].querySelectorAll('div');
        GameLayer.push(document.getElementById('GameLayer2'));
        GameLayer[1].children = GameLayer[1].querySelectorAll('div');
        GameLayerBG = document.getElementById('GameLayerBG');
        if (GameLayerBG.ontouchstart === null) {
            GameLayerBG.ontouchstart = gameTapEvent;
        } else {
            GameLayerBG.onmousedown = gameTapEvent;
        }
        gameInit();
        initSetting();
        
        // 初始化按钮动效
        setTimeout(initButtonEffects, 100);
        
        window.addEventListener('resize', refreshSize, false);
    }

    function getMode() {
        //有cookie优先返回cookie记录的，没有再返回normal
        return cookie('gameMode') ? parseInt(cookie('gameMode')) : MODE_NORMAL;
    }

    function getSoundMode() {
        // 默认为 on
        return cookie('soundMode') ? cookie('soundMode') : 'on';
    }

    function getSoundPreset() {
        return cookie('soundPreset') ? cookie('soundPreset') : 'tap1';
    }

    function getImagePreset() {
        return cookie('imagePreset') ? cookie('imagePreset') : 'custom';
    }

    function getNotePattern() {
        return cookie('notePattern') ? cookie('notePattern') : 'default';
    }

    w.changeSoundMode = function() {
        if (soundMode === 'on') {
            soundMode = 'off';
            $('#sound').text(I18N['sound-off']);
        } else {
            soundMode = 'on';
            $('#sound').text(I18N['sound-on']);
        }
        cookie('soundMode', soundMode);
    }

    // 音效预设切换功能
    w.changeSoundPreset = function() {
        currentSoundPreset = $('#soundPreset').val();
        cookie('soundPreset', currentSoundPreset, 100);
        
        // 重新注册点击音效
        createjs.Sound.registerSound({
            src: `./static/music/${currentSoundPreset}.mp3`,
            id: "tap"
        });
        
        console.log('音效预设已切换到:', currentSoundPreset);
    }

    // 图片预设切换功能
    w.changeImagePreset = function() {
        currentImagePreset = $('#imagePreset').val();
        cookie('imagePreset', currentImagePreset, 100);
        
        if (currentImagePreset === 'custom') {
            // 使用自定义图片，清除预设样式
            clickBeforeStyle.html('');
            clickAfterStyle.html('');
            console.log('已切换到自定义图片模式');
            return;
        }
        
        // 应用预设图片
        applyImagePreset(currentImagePreset);
        console.log('图片预设已切换到:', currentImagePreset);
    }

    // 音符模式切换功能
    w.changeNotePattern = function() {
        // 如果游戏正在进行中，提示用户
        if (_gameStart && !_gameOver) {
            if (!confirm('切换音符模式将重新开始游戏，确定要继续吗？')) {
                // 用户取消，恢复原来的选择
                $('#notePattern').val(currentNotePattern);
                return;
            }
        }
        
        currentNotePattern = $('#notePattern').val();
        cookie('notePattern', currentNotePattern, 100);
        
        // 完全重启游戏
        gameRestart();
        
        console.log('音符模式已切换到:', currentNotePattern, '- 游戏已重新开始');
    }

    // 应用图片预设
    function applyImagePreset(preset) {
        if (preset === 'custom') return;
        
        const beforeImageUrl = `./static/image/ClickBefore${preset}.png`;
        const afterImageUrl = `./static/image/ClickAfter${preset}.png`;
        
        clickBeforeStyle.html(`
            .t1, .t2, .t3, .t4, .t5 {
                background-size: cover !important;
                background-position: center !important;
                background-repeat: no-repeat !important;
                background-image: url(${beforeImageUrl}) !important;
            }
        `);
        
        clickAfterStyle.html(`
            .tt1, .tt2, .tt3, .tt4, .tt5 {
                background-size: cover !important;
                background-position: center !important;
                background-repeat: no-repeat !important;
                background-image: url(${afterImageUrl}) !important;
            }
        `);
        
        console.log('应用图片预设:', preset, beforeImageUrl, afterImageUrl);
    }

    // 按钮点击动效
    function addButtonClickEffect(buttonElement) {
        if (!buttonElement) return;
        
        buttonElement.style.transform = 'scale(0.95)';
        buttonElement.style.transition = 'transform 0.1s ease';
        
        setTimeout(() => {
            buttonElement.style.transform = 'scale(1)';
        }, 100);
    }

    // 为所有按钮添加点击动效
    function initButtonEffects() {
        const buttons = document.querySelectorAll('.btn, button, a[onclick]');
        buttons.forEach(button => {
            button.addEventListener('mousedown', () => {
                addButtonClickEffect(button);
            });
        });
    }

    // 星星粒子特效系统
    function createStarParticles(x, y) {
        const particleCount = 12; // 增加粒子数量
        const colors = ['#FFD700', '#FFA500', '#FF69B4', '#00CED1', '#98FB98', '#DDA0DD', '#FF6347', '#9370DB'];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'star-particle';
            
            // 随机颜色
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            // 随机方向和速度 - 增加速度
            const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.8;
            const velocity = 80 + Math.random() * 50; // 增加速度
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity;
            
            // 设置样式 - 增大粒子尺寸
            particle.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: ${y}px;
                width: 10px;
                height: 10px;
                background: ${color};
                border-radius: 50%;
                pointer-events: none;
                z-index: 1000;
                box-shadow: 0 0 12px ${color}, 0 0 20px ${color}40;
                transform: scale(1);
            `;
            
            document.body.appendChild(particle);
            
            // 动画 - 缩短持续时间
            let startTime = Date.now();
            const duration = 600; // 缩短动画时间
            
            function animate() {
                const elapsed = Date.now() - startTime;
                const progress = elapsed / duration;
                
                if (progress >= 1) {
                    particle.remove();
                    return;
                }
                
                // 位置计算 - 增加重力效果
                const currentX = x + vx * progress;
                const currentY = y + vy * progress + 0.5 * 300 * progress * progress; // 增加重力
                
                // 透明度和缩放
                const opacity = 1 - progress;
                const scale = 1 + progress * 0.5; // 先放大再缩小
                
                particle.style.left = currentX + 'px';
                particle.style.top = currentY + 'px';
                particle.style.opacity = opacity;
                particle.style.transform = `scale(${scale})`;
                
                requestAnimationFrame(animate);
            }
            
            requestAnimationFrame(animate);
        }
    }

    // 获取元素在页面中的绝对位置
    function getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }

    function modeToString(m) {
        return m === MODE_NORMAL ? I18N['normal'] : (m === MODE_ENDLESS ? I18N['endless'] : I18N['practice']);
    }

    w.changeMode = function(m) {
        mode = m;
        cookie('gameMode', m);
        $('#mode').text(modeToString(m));
    }

    w.readyBtn = function() {
        // 添加按钮动效
        const startBtn = event.target;
        addButtonClickEffect(startBtn);
        
        setTimeout(() => {
            closeWelcomeLayer();
            updatePanel();
        }, 150);
    }

    w.winOpen = function() {
        window.open(location.href + '?r=' + Math.random(), 'nWin', 'height=500,width=320,toolbar=no,menubar=no,scrollbars=no');
        let opened = window.open('about:blank', '_self');
        opened.opener = null;
        opened.close();
    }

    let refreshSizeTime;

    function refreshSize() {
        clearTimeout(refreshSizeTime);
        refreshSizeTime = setTimeout(_refreshSize, 200);
    }

    function _refreshSize() {
        countBlockSize();
        for (let i = 0; i < GameLayer.length; i++) {
            let box = GameLayer[i];
            for (let j = 0; j < box.children.length; j++) {
                let r = box.children[j],
                    rstyle = r.style;
                rstyle.left = (j % 4) * blockSize + 'px';
                rstyle.bottom = Math.floor(j / 4) * blockSize + 'px';
                rstyle.width = blockSize + 'px';
                rstyle.height = blockSize + 'px';
            }
        }
        let f, a;
        if (GameLayer[0].y > GameLayer[1].y) {
            f = GameLayer[0];
            a = GameLayer[1];
        } else {
            f = GameLayer[1];
            a = GameLayer[0];
        }
        let y = ((_gameBBListIndex) % 10) * blockSize;
        f.y = y;
        f.style[transform] = 'translate3D(0,' + f.y + 'px,0)';
        a.y = -blockSize * Math.floor(f.children.length / 4) + y;
        a.style[transform] = 'translate3D(0,' + a.y + 'px,0)';
    }

    function countBlockSize() {
        blockSize = body.offsetWidth / 4;
        body.style.height = window.innerHeight + 'px';
        GameLayerBG.style.height = window.innerHeight + 'px';
        touchArea[0] = window.innerHeight;
        touchArea[1] = window.innerHeight - blockSize * 3;
    }

    let _gameBBList = [],
        _gameBBListIndex = 0,
        _gameOver = false,
        _gameStart = false,
        _gameSettingNum=20,
        _gameTime, _gameTimeNum, _gameScore, _date1, deviationTime;

    let _gameStartTime, _gameStartDatetime;
    let _progressUpdateTimer; // 进度条更新计时器

    // 背景图片列表
    const backgroundImages = [
        'Still_001_001.png',
        'Still_002_001_1.png',
        'Still_250_001.png',
        'Still_360_001_1.png',
        'Still_380_001.png',
        'Still_470_009_1.png',
        'Still_480_005.png'
    ];

    // 设置随机背景图片
    function setRandomBackground() {
        const randomIndex = Math.floor(Math.random() * backgroundImages.length);
        const selectedImage = backgroundImages[randomIndex];
        const backgroundUrl = `./static/background/${selectedImage}`;
        
        // 设置整个页面的背景（最底层）
        document.body.style.backgroundImage = `url(${backgroundUrl})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundAttachment = 'fixed';
        
        console.log('随机选择的背景图片:', selectedImage);
    }

    // 更新时间显示
    function updateTimeDisplay(value) {
        document.getElementById('timeValue').textContent = value;
    }

    // 更新游戏时间设置
    function updateGameTime(value) {
        const timeNum = parseInt(value);
        _gameSettingNum = timeNum;
        
        // 同步更新隐藏的gameTime输入框
        const gameTimeInput = document.getElementById('gameTime');
        if (gameTimeInput) {
            gameTimeInput.value = timeNum;
        }
        
        // 如果游戏正在进行中，也需要更新当前的游戏时间
        if (!_gameStart && !_gameOver) {
            _gameTimeNum = timeNum;
        }
        
        console.log('游戏时间设置为:', timeNum + '秒');
    }

    // 初始化时间滑块
    function initTimeSlider() {
        const slider = document.getElementById('gameTimeSlider');
        const timeValue = document.getElementById('timeValue');
        const gameTimeInput = document.getElementById('gameTime');
        
        if (slider && timeValue) {
            // 从cookie或默认值设置初始值
            const savedTime = cookie('gameTime') || '20';
            const timeNum = Math.max(10, Math.min(60, parseInt(savedTime)));
            
            // 同步所有相关元素
            slider.value = timeNum;
            timeValue.textContent = timeNum;
            if (gameTimeInput) {
                gameTimeInput.value = timeNum;
            }
            _gameSettingNum = timeNum;
            
            console.log('初始化时间设置为:', timeNum + '秒');
        }
    }

    // 暴露函数到全局作用域
    w.updateTimeDisplay = updateTimeDisplay;
    w.updateGameTime = updateGameTime;

    // 音符生成状态变量
    let _lastNotePosition = -1;  // 上一个音符位置
    let _samePositionCount = 0;  // 连续相同位置计数
    let _holdNoteCount = 0;      // 纵连模式计数器
    let _holdPosition = -1;      // 纵连模式位置

    // 重置音符生成状态
    function resetNoteGenerationState() {
        _lastNotePosition = -1;
        _samePositionCount = 0;
        _holdNoteCount = 0;
        _holdPosition = -1;
        
        console.log('音符生成状态已重置，当前模式:', currentNotePattern);
    }

    // 调试函数：显示当前音符序列
    function debugNoteSequence() {
        const sequence = _gameBBList.map((note, index) => `${index}: 列${note.cell}`).join(', ');
        console.log('当前音符序列:', sequence);
        console.log('下一个音符索引:', _gameBBListIndex);
    }

    function gameInit() {
        createjs.Sound.registerSound({
            src: "./static/music/err.mp3",
            id: "err"
        });
        createjs.Sound.registerSound({
            src: "./static/music/end.mp3",
            id: "end"
        });
        // 使用当前音效预设，如果未定义则使用默认的tap1
        const soundFile = currentSoundPreset || 'tap1';
        createjs.Sound.registerSound({
            src: `./static/music/${soundFile}.mp3`,
            id: "tap"
        });
        gameRestart();
    }

    function gameRestart() {
        // 停止当前游戏
        if (_gameTime) {
            clearInterval(_gameTime);
        }
        
        // 清理进度条更新计时器
        if (_progressUpdateTimer) {
            clearInterval(_progressUpdateTimer);
            _progressUpdateTimer = null;
        }
        
        // 重置所有游戏状态
        _gameBBList = [];
        _gameBBListIndex = 0;
        _gameScore = 0;
        _gameOver = false;
        _gameStart = false;
        _gameTimeNum = _gameSettingNum;
        _gameStartTime = 0;
        
        // 重置音符生成状态
        resetNoteGenerationState();
        
        // 清除所有音符的视觉状态
        for (let i = 0; i < GameLayer.length; i++) {
            let box = GameLayer[i];
            for (let j = 0; j < box.children.length; j++) {
                let r = box.children[j];
                r.className = r.className.replace(_clearttClsReg, '');
                r.classList.remove('bad');
                r.notEmpty = false;
            }
        }
        
        // 重新计算布局
        countBlockSize();
        
        // 重新生成音符
        refreshGameLayer(GameLayer[0]);
        refreshGameLayer(GameLayer[1], 1);
        
        // 更新界面
        updatePanel();
        
        console.log('游戏已完全重启，音符模式:', currentNotePattern);
    }

    function gameStart() {
        _date1 = new Date();
        _gameStartDatetime = _date1.getTime();
        _gameStart = true;
        
        // 隐藏开始图片
        updateStartImage();

        // 主计时器每秒更新一次（用于时间递减）
        _gameTime = setInterval(timer, 1000);
        
        // 进度条更新计时器每0.03秒更新一次（仅用于普通模式的进度条动画）
        if (mode === MODE_NORMAL) {
            _progressUpdateTimer = setInterval(updateProgressBar, 30); // 30ms = 0.03s
        }
        
        // 调试：显示当前音符序列
        debugNoteSequence();
    }

    function getCPS() {
        let cps = _gameScore / ((new Date().getTime() - _gameStartDatetime) / 1000);
        if (isNaN(cps) || cps === Infinity || _gameStartTime < 2) {
            cps = 0;
        }
        return cps;
    }

    function timer() {
        _gameTimeNum--;
        _gameStartTime++;
        if (mode === MODE_NORMAL && _gameTimeNum <= 0) {
            GameTimeLayer.innerHTML = I18N['time-up'] + '!';
            gameOver();
            GameLayerBG.className += ' flash';
            if (soundMode === 'on') {
                createjs.Sound.play("end");
            }
        }
        updatePanel();
    }

    function updatePanel() {
        // 显示或隐藏开始图片
        updateStartImage();
        
        if (mode === MODE_NORMAL) {
            if (!_gameOver && !_gameStart) {
                // 游戏还没开始时显示初始进度条
                const progressHtml = createTimeProgressBar(_gameTimeNum, _gameSettingNum);
                GameTimeLayer.innerHTML = progressHtml;
            }
            // 游戏开始后，进度条由updateProgressBar函数高频更新，这里不再更新
        } else if (mode === MODE_ENDLESS) {
            let cps = getCPS();
            const progressHtml = createCPSProgressBar(cps);
            GameTimeLayer.innerHTML = progressHtml;
        } else {
            GameTimeLayer.innerHTML = `SCORE:${_gameScore}`;
        }
    }

    // 更新开始图片的显示状态
    function updateStartImage() {
        let startImageContainer = document.getElementById('start-image-container');
        
        // 如果容器不存在，创建它
        if (!startImageContainer && welcomeLayerClosed && !_gameStart) {
            startImageContainer = document.createElement('div');
            startImageContainer.id = 'start-image-container';
            startImageContainer.className = 'start-image-container';
            startImageContainer.innerHTML = '<img src="./static/image/start.png" alt="Start" class="start-image">';
            document.body.appendChild(startImageContainer);
        }
        
        // 控制显示状态 - 只在游戏界面且游戏未开始时显示
        if (startImageContainer) {
            // 检查是否在欢迎界面
            const welcomeElement = document.getElementById('welcome');
            const isWelcomeVisible = welcomeElement && welcomeElement.style.display !== 'none';
            
            // 只有在非欢迎界面、游戏界面已显示、但游戏还没开始时才显示start.png
            if (welcomeLayerClosed && !_gameStart && !_gameOver && !isWelcomeVisible) {
                startImageContainer.classList.add('show');
            } else {
                startImageContainer.classList.remove('show');
                // 如果游戏已开始或回到主界面，延迟移除元素
                if (_gameStart || isWelcomeVisible) {
                    setTimeout(() => {
                        if (startImageContainer && startImageContainer.parentNode) {
                            startImageContainer.parentNode.removeChild(startImageContainer);
                        }
                    }, 500);
                }
            }
        }
    }

    // 专门用于更新进度条的函数（高频更新）
    function updateProgressBar() {
        if (mode === MODE_NORMAL && !_gameOver && _gameStart) {
            // 计算精确的剩余时间（包含毫秒）
            const elapsed = (Date.now() - _gameStartDatetime) / 1000;
            const preciseTimeLeft = Math.max(0, _gameSettingNum - elapsed);
            
            const progressHtml = createTimeProgressBar(preciseTimeLeft, _gameSettingNum);
            GameTimeLayer.innerHTML = progressHtml;
        }
    }
    //使重试按钮获得焦点
    function foucusOnReplay(){
        $('#replay').focus()
    }

    function gameOver() {
        _gameOver = true;
        clearInterval(_gameTime);
        
        // 清理进度条更新计时器
        if (_progressUpdateTimer) {
            clearInterval(_progressUpdateTimer);
            _progressUpdateTimer = null;
        }
        
        let cps = getCPS();
        updatePanel();
        setTimeout(function () {
            GameLayerBG.className = '';
            showGameScoreLayer(cps);
            foucusOnReplay();
        }, 1500);
    }


    function encrypt(text) {
        let encrypt = new JSEncrypt();
        encrypt.setPublicKey("MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDTzGwX6FVKc7rDiyF3H+jKpBlRCV4jOiJ4JR33qZPVXx8ahW6brdBF9H1vdHBAyO6AeYBumKIyunXP9xzvs1qJdRNhNoVwHCwGDu7TA+U4M7G9FArDG0Y6k4LbS0Ks9zeRBMiWkW53yQlPshhtOxXCuZZOMLqk1vEvTCODYYqX5QIDAQAB");
        return encrypt.encrypt(text);
    }

    function SubmitResults() {
        if ($("#username").val() && _gameSettingNum === 20) {
            let httpRequest = new XMLHttpRequest();
            httpRequest.open('POST', './SubmitResults.php', true);
            httpRequest.setRequestHeader("Content-type", "application/json");
            let name = $("#username").val();
            let message = $("#message").val();
            let test = "|_|";
            httpRequest.send(encrypt(_gameScore + test + name + test + tj + test + message));
        }
    }

    function createTimeText(n) {
        return 'TIME:' + Math.ceil(n);
    }

    // 创建时间进度条
    function createTimeProgressBar(currentTime, totalTime) {
        // 时间是递减的，所以要反向计算百分比
        const percentage = Math.max(0, Math.min(100, (currentTime / totalTime) * 100));
        const colorClass = getProgressColorClass(percentage);
        
        // 显示精确到一位小数的时间
        const displayTime = currentTime >= 0.1 ? currentTime.toFixed(1) : '0.0';
        
        return `
            <div class="progress-container">
                <div class="progress-bar ${colorClass}" style="width: ${percentage}%"></div>
                <div class="progress-text">${displayTime}s</div>
            </div>
        `;
    }

    // 创建CPS进度条
    function createCPSProgressBar(cps) {
        const maxCPS = 15;
        const percentage = Math.min(100, (cps / maxCPS) * 100);
        const colorClass = getProgressColorClass(percentage);
        
        return `
            <div class="progress-container">
                <div class="progress-bar ${colorClass}" style="width: ${percentage}%"></div>
                <div class="progress-text">${cps.toFixed(2)} CPS</div>
            </div>
        `;
    }

    // 根据百分比获取进度条颜色类
    function getProgressColorClass(percentage) {
        if (percentage <= 30) {
            return 'progress-red';
        } else if (percentage <= 60) {
            return 'progress-yellow';
        } else {
            return 'progress-green';
        }
    }

    let _ttreg = / t{1,2}(\d+)/,
        _clearttClsReg = / t{1,2}\d+| bad/;

    function refreshGameLayer(box, loop, offset) {
        // 重置当前层的音符生成状态（仅用于该层）
        let layerNotePositions = [];
        
        // 为每一行生成音符位置
        const rows = Math.floor(box.children.length / 4);
        for (let row = 0; row < rows; row++) {
            const basePosition = row * 4;
            let notePosition;
            
            if (row === 0) {
                // 第一行使用全局生成逻辑
                notePosition = generateNotePosition(loop);
            } else {
                // 后续行基于前一个位置生成
                notePosition = generateNextNotePosition(basePosition);
            }
            
            layerNotePositions.push(notePosition);
        }
        
        // 应用生成的音符位置
        for (let j = 0; j < box.children.length; j++) {
            let r = box.children[j], rstyle = r.style;
            rstyle.left = (j % 4) * blockSize + 'px';
            rstyle.bottom = Math.floor(j / 4) * blockSize + 'px';
            rstyle.width = blockSize + 'px';
            rstyle.height = blockSize + 'px';
            r.className = r.className.replace(_clearttClsReg, '');
            
            const rowIndex = Math.floor(j / 4);
            const expectedNotePosition = layerNotePositions[rowIndex];
            
            if (j === expectedNotePosition) {
                _gameBBList.push({
                    cell: j % 4,
                    id: r.id
                });
                r.className += ' t' + (Math.floor(Math.random() * 1000) % 5 + 1);
                r.notEmpty = true;
            } else {
                r.notEmpty = false;
            }
        }
        
        if (loop) {
            box.style.webkitTransitionDuration = '0ms';
            box.style.display = 'none';
            box.y = -blockSize * (Math.floor(box.children.length / 4) + (offset || 0)) * loop;
            setTimeout(function () {
                box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';
                setTimeout(function () {
                    box.style.display = 'block';
                }, 100);
            }, 200);
        } else {
            box.y = 0;
            box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';
        }
        box.style[transitionDuration] = '150ms';
    }

    // 生成初始音符位置
    function generateNotePosition(loop) {
        const basePosition = loop ? 0 : 4;
        
        switch (currentNotePattern) {
            case 'stair':
                return generateStairPosition(basePosition);
            case 'hold':
                return generateHoldPosition(basePosition);
            default:
                return Math.floor(Math.random() * 1000) % 4 + basePosition;
        }
    }

    // 生成下一个音符位置
    function generateNextNotePosition(basePosition) {
        switch (currentNotePattern) {
            case 'stair':
                return generateStairPosition(basePosition);
            case 'hold':
                return generateHoldPosition(basePosition);
            default:
                return basePosition + Math.floor(Math.random() * 1000) % 4;
        }
    }

    // 楼梯模式：不会连续生成在同一位置超过两次
    function generateStairPosition(basePosition) {
        let position;
        let attempts = 0;
        
        do {
            position = basePosition + Math.floor(Math.random() * 4);
            attempts++;
            
            // 防止无限循环
            if (attempts > 10) {
                break;
            }
        } while (_lastNotePosition !== -1 && 
                 (position % 4) === (_lastNotePosition % 4) && 
                 _samePositionCount >= 2);
        
        // 更新状态
        if (_lastNotePosition !== -1 && (position % 4) === (_lastNotePosition % 4)) {
            _samePositionCount++;
        } else {
            _samePositionCount = 1;
        }
        
        _lastNotePosition = position;
        return position;
    }

    // 纵连模式：连续生成的数量为4的倍数，必然连续生成在同一位置
    function generateHoldPosition(basePosition) {
        // 如果是新的纵连序列开始
        if (_holdNoteCount === 0) {
            _holdPosition = Math.floor(Math.random() * 4);
            _holdNoteCount = 4; // 设置为4个连续音符
        }
        
        const position = basePosition + _holdPosition;
        _holdNoteCount--;
        
        // 如果纵连序列结束，重置计数器
        if (_holdNoteCount === 0) {
            _holdPosition = -1;
        }
        
        return position;
    }

    function gameLayerMoveNextRow() {
        for (let i = 0; i < GameLayer.length; i++) {
            let g = GameLayer[i];
            g.y += blockSize;
            if (g.y > blockSize * (Math.floor(g.children.length / 4))) {
                refreshGameLayer(g, 1, -1);
            } else {
                g.style[transform] = 'translate3D(0,' + g.y + 'px,0)';
            }
        }
    }

    function gameTapEvent(e) {
        if (_gameOver) {
            return false;
        }
        let tar = e.target;
        let y = e.clientY || e.targetTouches[0].clientY,
            x = (e.clientX || e.targetTouches[0].clientX) - body.offsetLeft,
            p = _gameBBList[_gameBBListIndex];
        if (y > touchArea[0] || y < touchArea[1]) {
            return false;
        }
        if ((p.id === tar.id && tar.notEmpty) || (p.cell === 0 && x < blockSize) || (p.cell === 1 && x > blockSize && x < 2 *
            blockSize) || (p.cell === 2 && x > 2 * blockSize && x < 3 * blockSize) || (p.cell === 3 && x > 3 * blockSize)) {
            if (!_gameStart) {
                gameStart();
            }
            if (soundMode === 'on') {
                createjs.Sound.play("tap");
            }
            tar = document.getElementById(p.id);
            
            // 添加星星粒子特效
            const pos = getElementPosition(tar);
            createStarParticles(pos.x, pos.y);
            
            tar.className = tar.className.replace(_ttreg, ' tt$1');
            _gameBBListIndex++;
            _gameScore++;

            updatePanel();

            gameLayerMoveNextRow();
        } else if (_gameStart && !tar.notEmpty) {
            if (soundMode === 'on') {
                createjs.Sound.play("err");
            }
            tar.classList.add('bad');
            if (mode === MODE_PRACTICE) {
                setTimeout(() => {
                    tar.classList.remove('bad');
                }, 500);
            } else {
                gameOver();
            }
        }
        return false;
    }

    function createGameLayer() {
        let html = '<div id="GameLayerBG">';
        for (let i = 1; i <= 2; i++) {
            let id = 'GameLayer' + i;
            html += '<div id="' + id + '" class="GameLayer">';
            for (let j = 0; j < 10; j++) {
                for (let k = 0; k < 4; k++) {
                    html += '<div id="' + id + '-' + (k + j * 4) + '" num="' + (k + j * 4) + '" class="block' + (k ? ' bl' : '') +
                        '"></div>';
                }
            }
            html += '</div>';
        }
        html += '</div>';
        html += '<div id="GameTimeLayer" class="text-center"></div>';
        return html;
    }

    function closeWelcomeLayer() {
        welcomeLayerClosed = true;
        $('#welcome').css('display', 'none');
        updatePanel();
    }

    function showWelcomeLayer() {
        welcomeLayerClosed = false;
        $('#mode').text(modeToString(mode));
        $('#welcome').css('display', 'block');
        
        // 隐藏开始图片（如果存在）
        updateStartImage();
    }

    function getBestScore(score) {
        // 练习模式不会进入算分界面
        let cookieName = (mode === MODE_NORMAL ? 'bast-score' : 'endless-best-score');
        let best = cookie(cookieName) ? Math.max(parseFloat(cookie(cookieName)), score) : score;
        cookie(cookieName, best.toFixed(2), 100);
        return best;
    }

    function scoreToString(score) {
        return mode === MODE_ENDLESS ? score.toFixed(2) : score.toString();
    }

    function legalDeviationTime() {
        return deviationTime < (_gameSettingNum + 3) * 1000;
    }

    function showGameScoreLayer(cps) {
        let l = $('#GameScoreLayer');
        let c = $(`#${_gameBBList[_gameBBListIndex - 1].id}`).attr('class').match(_ttreg)[1];
        let score = (mode === MODE_ENDLESS ? cps : _gameScore);
        let best = getBestScore(score);
        l.attr('class', l.attr('class').replace(/bgc\d/, 'bgc' + c));
        $('#GameScoreLayer-text').html(shareText(cps));
        let normalCond = legalDeviationTime() || mode !== MODE_NORMAL;
        l.css('color', normalCond ? '': 'red');

        $('#cps').text(cps.toFixed(2));
        $('#score').text(scoreToString(score));
        $('#GameScoreLayer-score').css('display', mode === MODE_ENDLESS ? 'none' : '');
        $('#best').text(scoreToString(best));

        l.css('display', 'block');
    }

    function hideGameScoreLayer() {
        $('#GameScoreLayer').css('display', 'none');
    }

    w.replayBtn = function() {
        // 添加按钮动效
        const replayBtn = event.target;
        addButtonClickEffect(replayBtn);
        
        setTimeout(() => {
            gameRestart();
            hideGameScoreLayer();
        }, 150);
    }

    w.backBtn = function() {
        gameRestart();
        hideGameScoreLayer();
        showWelcomeLayer();
    }

    function shareText(cps) {
        if (mode === MODE_NORMAL) {
            let date2 = new Date();
            deviationTime = (date2.getTime() - _date1.getTime())
            if (!legalDeviationTime()) {
                return I18N['time-over'] + ((deviationTime / 1000) - _gameSettingNum).toFixed(2) + 's';
            }
            SubmitResults();
        }

        if (cps <= 5) return I18N['text-level-1'];
        if (cps <= 8) return I18N['text-level-2'];
        if (cps <= 10)  return I18N['text-level-3'];
        if (cps <= 15) return I18N['text-level-4'];
        return I18N['text-level-5'];
    }

    function toStr(obj) {
        if (typeof obj === 'object') {
            return JSON.stringify(obj);
        } else {
            return obj;
        }
    }

    function cookie(name, value, time) {
        if (name) {
            if (value) {
                if (time) {
                    let date = new Date();
                    date.setTime(date.getTime() + 864e5 * time), time = date.toGMTString();
                }
                return document.cookie = name + "=" + escape(toStr(value)) + (time ? "; expires=" + time + (arguments[3] ?
                    "; domain=" + arguments[3] + (arguments[4] ? "; path=" + arguments[4] + (arguments[5] ? "; secure" : "") : "") :
                    "") : ""), !0;
            }
            return value = document.cookie.match("(?:^|;)\\s*" + name.replace(/([-.*+?^${}()|[\]\/\\])/g, "\\$1") + "=([^;]*)"),
                value = value && "string" == typeof value[1] ? unescape(value[1]) : !1, (/^(\{|\[).+\}|\]$/.test(value) ||
                /^[0-9]+$/g.test(value)) && eval("value=" + value), value;
        }
        let data = {};
        value = document.cookie.replace(/\s/g, "").split(";");
        for (let i = 0; value.length > i; i++) name = value[i].split("="), name[1] && (data[name[0]] = unescape(name[1]));
        return data;
    }

    document.write(createGameLayer());

    function initSetting() {
        $("#username").val(cookie("username") ? cookie("username") : "");
        $("#message").val(cookie("message") ? cookie("message") : "");
        if (cookie("title")) {
            $('title').text(cookie('title'));
            $('#title').val(cookie('title'));
        }
        let keyboard = cookie('keyboard');
        if (keyboard) {
            keyboard = keyboard.toString().toLowerCase();
            $("#keyboard").val(keyboard);
            map = {}
            map[keyboard.charAt(0)] = 1;
            map[keyboard.charAt(1)] = 2;
            map[keyboard.charAt(2)] = 3;
            map[keyboard.charAt(3)] = 4;
        }
        if (cookie('gameTime')) {
            $('#gameTime').val(cookie('gameTime'));
            _gameSettingNum = parseInt(cookie('gameTime'));
            gameRestart();
        }
        
        // 初始化预设选择器
        $('#soundPreset').val(currentSoundPreset);
        $('#imagePreset').val(currentImagePreset);
        $('#notePattern').val(currentNotePattern);
        
        // 应用当前图片预设
        if (currentImagePreset !== 'custom') {
            applyImagePreset(currentImagePreset);
        }
        
        console.log('初始化设置完成 - 音效预设:', currentSoundPreset, '图片预设:', currentImagePreset, '音符模式:', currentNotePattern);
    }

    w.show_btn = function() {
        $("#btn_group,#desc").css('display', 'block')
        $('#setting').css('display', 'none')
    }

    w.show_setting = function() {
        $('#btn_group,#desc').css('display', 'none')
        $('#setting').css('display', 'block')
        $('#sound').text(soundMode === 'on' ? I18N['sound-on'] : I18N['sound-off']);
        
        // 确保预设选择器显示正确的值
        $('#soundPreset').val(currentSoundPreset);
        $('#imagePreset').val(currentImagePreset);
        $('#notePattern').val(currentNotePattern);
        
        console.log('显示设置界面 - 当前音效预设:', currentSoundPreset, '当前图片预设:', currentImagePreset, '当前音符模式:', currentNotePattern);
    }

    w.save_cookie = function() {
        const settings = ['username', 'message', 'keyboard', 'title', 'gameTime'];
        for (let s of settings) {
            let value=$(`#${s}`).val();
            if(value){
                cookie(s, value.toString(), 100);
            }
        }
        
        // 保存预设选择
        const soundPresetValue = $('#soundPreset').val();
        const imagePresetValue = $('#imagePreset').val();
        const notePatternValue = $('#notePattern').val();
        
        if (soundPresetValue) {
            cookie('soundPreset', soundPresetValue, 100);
            currentSoundPreset = soundPresetValue;
        }
        
        if (imagePresetValue) {
            cookie('imagePreset', imagePresetValue, 100);
            currentImagePreset = imagePresetValue;
        }
        
        if (notePatternValue) {
            cookie('notePattern', notePatternValue, 100);
            currentNotePattern = notePatternValue;
        }
        
        console.log('保存设置 - 音效预设:', currentSoundPreset, '图片预设:', currentImagePreset, '音符模式:', currentNotePattern);
        
        initSetting();
    }

    function isnull(val) {
        let str = val.replace(/(^\s*)|(\s*$)/g, '');
        return str === '' || str === undefined || str == null;
    }

    w.goRank = function() {
        let name = $("#username").val();
        let link = './rank.php';
        if (!isnull(name)) {
            link += "?name=" + name;
        }
        window.location.href = link;
    }

    function click(index) {
        if (!welcomeLayerClosed) {
            return;
        }

        let p = _gameBBList[_gameBBListIndex];
        let base = parseInt($(`#${p.id}`).attr("num")) - p.cell;
        let num = base + index - 1;
        let id = p.id.substring(0, 11) + num;

        let fakeEvent = {
            clientX: ((index - 1) * blockSize + index * blockSize) / 2 + body.offsetLeft,
            // Make sure that it is in the area
            clientY: (touchArea[0] + touchArea[1]) / 2,
            target: document.getElementById(id),
        };

        gameTapEvent(fakeEvent);
    }

    const clickBeforeStyle = $('<style></style>');
    const clickAfterStyle = $('<style></style>');
    clickBeforeStyle.appendTo($(document.head));
    clickAfterStyle.appendTo($(document.head));

    function saveImage(dom, callback) {
        if (dom.files && dom.files[0]) {
            let reader = new FileReader();
            reader.onload = function() {
                callback(this.result);
            }
            reader.readAsDataURL(dom.files[0]);
        }
    }


    w.getClickBeforeImage = function() {
        $('#click-before-image').click();
    }

    w.saveClickBeforeImage = function() {
        const img = document.getElementById('click-before-image');
        saveImage(img, r => {
            clickBeforeStyle.html(`
                .t1, .t2, .t3, .t4, .t5 {
                   background-size: auto 100%;
                   background-image: url(${r});
            }`);
        })
    }

    w.getClickAfterImage = function() {
        $('#click-after-image').click();
    }

    w.saveClickAfterImage = function() {
        const img = document.getElementById('click-after-image');
        saveImage(img, r => {
            clickAfterStyle.html(`
                .tt1, .tt2, .tt3, .tt4, .tt5 {
                  background-size: auto 86%;
                  background-image: url(${r});
            }`);
        })
    }
}) (window);