import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { transcodeAudioForWhatsApp } from '../whatsapp-engine/MessageService';

async function testPhase2AudioTranscoding() {
  console.log('================================================================');
  console.log('🚀 TESTING PHASE 2: AUDIO TRANSCODING & MEDIA HANDLING');
  console.log('================================================================');

  // Create a dummy webm file for testing
  const dummyWebmPath = path.join(__dirname, 'test_dummy_audio.webm');
  fs.writeFileSync(dummyWebmPath, 'dummy audio webm content for test');

  console.log(`Created dummy input audio file: ${dummyWebmPath}`);

  // Test transcodeAudioForWhatsApp function (gracefully handles non-audio or ffmpeg missing)
  const resultPath = await transcodeAudioForWhatsApp(dummyWebmPath);
  console.log(`Transcoder output path: ${resultPath}`);

  if (resultPath) {
    console.log('✅ PASS: transcodeAudioForWhatsApp completed without throwing exceptions!');
  } else {
    console.error('❌ FAIL: transcodeAudioForWhatsApp failed!');
  }

  // Cleanup
  if (fs.existsSync(dummyWebmPath)) fs.unlinkSync(dummyWebmPath);
  if (fs.existsSync(`${dummyWebmPath}.ogg`)) fs.unlinkSync(`${dummyWebmPath}.ogg`);
  console.log('Cleanup complete.');
}

testPhase2AudioTranscoding().catch(console.error);
