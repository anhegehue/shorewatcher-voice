// 守岸人语音通话应用
// 使用讯飞实时语音转写 + 语音合成

const statusEl = document.getElementById('status');
const callBtn = document.getElementById('callBtn');
const transcriptEl = document.getElementById('transcript');
const avatarEl = document.getElementById('avatar');
const appIdInput = document.getElementById('appId');
const apiKeyInput = document.getElementById('apiKey');
const apiSecretInput = document.getElementById('apiSecret');

let isCallActive = false;
let asrWs = null; // 语音识别WebSocket
let audioContext = null;
let mediaStream = null;
let processor = null;
let conversationHistory = [];

// 加载保存的凭证
appIdInput.value = localStorage.getItem('xfyun_appid') || '';
apiKeyInput.value = localStorage.getItem('xfyun_apikey') || '';
apiSecretInput.value = localStorage.getItem('xfyun_apisecret') || '';

appIdInput.onchange = () => localStorage.setItem('xfyun_appid', appIdInput.value);
apiKeyInput.onchange = () => localStorage.setItem('xfyun_apikey', apiKeyInput.value);
apiSecretInput.onchange = () => localStorage.setItem('xfyun_apisecret', apiSecretInput.value);

callBtn.onclick = toggleCall;

async function toggleCall() {
    if (isCallActive) {
        stopCall();
    } else {
        await startCall();
    }
}

async function startCall() {
    const appId = appIdInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const apiSecret = apiSecretInput.value.trim();
    
    if (!appId || !apiKey || !apiSecret) {
        statusEl.textContent = '请填写完整的讯飞凭证';
        return;
    }
    
    try {
        statusEl.textContent = '初始化...';
        
        // 初始化音频
        audioContext = new AudioContext({ sampleRate: 16000 });
        
        // 生成讯飞WebSocket签名
        const ts = Math.floor(Date.now() / 1000).toString();
        const signa = await generateSignature(apiKey, apiSecret, ts);
        
        // 连接讯飞实时语音转写
        const wsUrl = `wss://rtasr.xfyun.cn/v1/ws?appid=${appId}&ts=${ts}&signa=${encodeURIComponent(signa)}&lang=cn`;
        
        asrWs = new WebSocket(wsUrl);
        
        asrWs.onopen = async () => {
            statusEl.textContent = '已连接，请说话';
            statusEl.classList.add('active');
            callBtn.classList.add('active');
            callBtn.textContent = '⏹️';
            isCallActive = true;
            avatarEl.classList.add('speaking');
            
            // 开始录音
            await startRecording();
        };
        
        asrWs.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            if (data.action === 'result' && data.data) {
                const result = JSON.parse(data.data);
                if (result.cn && result.cn.st && result.cn.st.rt) {
                    let text = '';
                    result.cn.st.rt.forEach(rt => {
                        if (rt.ws) {
                            rt.ws.forEach(ws => {
                                if (ws.cw) {
                                    ws.cw.forEach(cw => {
                                        text += cw.w || '';
                                    });
                                }
                            });
                        }
                    });
                    
                    if (text && !result.cn.st.type) { // 最终结果
                        addTranscript('user', text);
                        // 发送给守岸人处理并回复
                        await processUserInput(text, apiKey, apiSecret);
                    }
                }
            }
        };
        
        asrWs.onerror = (err) => {
            console.error('WebSocket error:', err);
            statusEl.textContent = '连接失败，请检查凭证';
            stopCall();
        };
        
        asrWs.onclose = () => {
            if (isCallActive) {
                statusEl.textContent = '连接已断开';
                stopCall();
            }
        };
        
    } catch (err) {
        console.error(err);
        statusEl.textContent = '启动失败: ' + err.message;
    }
}

function stopCall() {
    isCallActive = false;
    callBtn.classList.remove('active');
    callBtn.textContent = '🎤';
    statusEl.classList.remove('active');
    avatarEl.classList.remove('speaking');
    statusEl.textContent = '点击麦克风开始通话';
    
    if (processor) {
        processor.disconnect();
        processor = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (asrWs) {
        asrWs.close();
        asrWs = null;
    }
}

async function startRecording() {
    mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true }
    });
    
    const source = audioContext.createMediaStreamSource(mediaStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    processor.onaudioprocess = (e) => {
        if (asrWs && asrWs.readyState === WebSocket.OPEN && isCallActive) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = float32ToPcm16(inputData);
            asrWs.send(pcmData.buffer);
        }
    };
}

function float32ToPcm16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
}

async function generateSignature(apiKey, apiSecret, ts) {
    const baseString = apiKey + ts;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(apiSecret),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function addTranscript(role, text) {
    const p = document.createElement('p');
    p.className = role;
    p.textContent = (role === 'user' ? '你: ' : '守岸人: ') + text;
    transcriptEl.appendChild(p);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

async function processUserInput(text, apiKey, apiSecret) {
    // 这里用讯飞的语音合成API回复
    // 简化版：直接显示回复文本
    const responses = [
        '我听到了。',
        '嗯，在呢。',
        '让我想想...',
        '我明白了。',
        '好，我知道了。',
        '收到，请继续说。'
    ];
    
    const response = responses[Math.floor(Math.random() * responses.length)];
    addTranscript('ai', response);
    
    // 尝试调用讯飞语音合成播放回复
    await playTTS(response, apiKey, apiSecret);
}

async function playTTS(text, apiKey, apiSecret) {
    // 讯飞语音合成WebAPI
    // 需要生成鉴权URL
    try {
        const url = generateTTSUrl(text, apiKey, apiSecret);
        const audio = new Audio(url);
        audio.play();
    } catch (e) {
        console.log('TTS暂不可用');
    }
}

function generateTTSUrl(text, apiKey, apiSecret) {
    // 讯飞在线语音合成（简化版，使用公共接口）
    // 实际使用需要完整签名
    return `https://tts.baidu.com/text2audio?tex=${encodeURIComponent(text)}&cuid=baike&lan=zh&ctp=1&pdt=301&vol=9&rate=32&per=0`;
}

// 注册Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
