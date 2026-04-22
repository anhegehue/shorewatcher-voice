// 守岸人语音通话应用
// 使用阿里云 qwen3.5-omni 实时语音API

const statusEl = document.getElementById('status');
const callBtn = document.getElementById('callBtn');
const transcriptEl = document.getElementById('transcript');
const avatarEl = document.getElementById('avatar');
const apiKeyInput = document.getElementById('apiKey');

let isCallActive = false;
let mediaRecorder = null;
let audioContext = null;
let ws = null;
let audioQueue = [];
let isPlaying = false;

// 加载保存的API Key
apiKeyInput.value = localStorage.getItem('aliyun_api_key') || '';
apiKeyInput.onchange = () => {
    localStorage.setItem('aliyun_api_key', apiKeyInput.value);
};

callBtn.onclick = toggleCall;

async function toggleCall() {
    if (isCallActive) {
        stopCall();
    } else {
        await startCall();
    }
}

async function startCall() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        statusEl.textContent = '请先输入 API Key';
        return;
    }
    
    try {
        statusEl.textContent = '连接中...';
        
        // 阿里云实时语音API - 正确的WebSocket连接方式
        // 需要通过URL参数传递认证信息
        const wsUrl = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-omni-flash`;
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = async () => {
            statusEl.textContent = '已连接，请说话';
            statusEl.classList.add('active');
            callBtn.classList.add('active');
            callBtn.textContent = '⏹️';
            isCallActive = true;
            avatarEl.classList.add('speaking');
            
            // 发送认证消息
            ws.send(JSON.stringify({
                type: 'auth',
                api_key: apiKey
            }));
            
            // 发送session配置
            setTimeout(() => {
                ws.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        modalities: ['text', 'audio'],
                        input_audio_format: 'pcm16',
                        output_audio_format: 'pcm16',
                        input_audio_transcription: { model: 'whisper-1' },
                        turn_detection: { type: 'server_vad' }
                    }
                }));
            }, 100);
            
            // 开始录音
            await startRecording();
        };
        
        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            handleMessage(data);
        };
        
        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            statusEl.textContent = '连接失败，请检查网络或API Key';
            stopCall();
        };
        
        ws.onclose = () => {
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
    
    if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder = null;
    }
    if (ws) {
        ws.close();
        ws = null;
    }
    audioQueue = [];
    isPlaying = false;
}

async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 16000, channelCount: 1 } 
    });
    
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    processor.onaudioprocess = (e) => {
        if (ws && ws.readyState === WebSocket.OPEN && isCallActive) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = float32ToPcm16(inputData);
            const base64Audio = arrayBufferToBase64(pcmData.buffer);
            
            ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64Audio
            }));
        }
    };
    
    mediaRecorder = { stop: () => {
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach(t => t.stop());
    }};
}

function float32ToPcm16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function handleMessage(data) {
    if (data.type === 'response.audio_transcript.delta') {
        addTranscript('ai', data.delta);
        avatarEl.classList.add('speaking');
    }
    
    if (data.type === 'response.audio.delta') {
        playAudio(data.delta);
    }
    
    if (data.type === 'response.done') {
        avatarEl.classList.remove('speaking');
    }
    
    if (data.type === 'conversation.item.input_audio_transcription.completed') {
        addTranscript('user', data.transcript);
    }
    
    if (data.type === 'error') {
        console.error('API Error:', data);
        statusEl.textContent = '错误: ' + (data.error?.message || '未知错误');
    }
    
    if (data.type === 'auth_failed' || data.type === 'authentication_error') {
        statusEl.textContent = '认证失败，请检查API Key';
        stopCall();
    }
}

function addTranscript(role, text) {
    const p = document.createElement('p');
    p.className = role;
    p.textContent = (role === 'user' ? '你: ' : '守岸人: ') + text;
    transcriptEl.appendChild(p);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

async function playAudio(base64Audio) {
    if (!audioContext) return;
    
    try {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
        }
        
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
    } catch (e) {
        console.error('Audio playback error:', e);
    }
}

// 注册Service Worker（PWA）
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
