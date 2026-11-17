import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMechanicalAudioConfig,
  isMechanicalSoundEnabled,
  playKeyboardEngage,
  playRejectMechanism,
  playReverseDetent,
  playUnlockMechanism,
  playWheelDetent,
  playWheelSettle,
  setMechanicalAudioConfig,
} from '../src/services/mechanicalAudio.js';

test('mechanical audio config defaults, toggles, and volume clamping work safely', () => {
  const initial = getMechanicalAudioConfig();
  assert.equal(initial.enabled, true);
  assert.equal(initial.volume, 45);
  assert.equal(isMechanicalSoundEnabled(), true);

  setMechanicalAudioConfig({ volume: 180 });
  assert.equal(getMechanicalAudioConfig().volume, 100);

  setMechanicalAudioConfig({ volume: -20 });
  assert.equal(getMechanicalAudioConfig().volume, 0);
  assert.equal(isMechanicalSoundEnabled(), false);

  setMechanicalAudioConfig({ enabled: false, volume: 45 });
  assert.equal(isMechanicalSoundEnabled(), false);

  setMechanicalAudioConfig({ enabled: true, volume: 45 });
  assert.equal(isMechanicalSoundEnabled(), true);
});

test('mechanical audio playback helpers never throw or block when AudioContext is unavailable or muted', () => {
  setMechanicalAudioConfig({ enabled: false, volume: 45 });
  assert.doesNotThrow(() => {
    playWheelDetent(0);
    playKeyboardEngage(2);
    playReverseDetent(1);
    playWheelSettle(3);
    playUnlockMechanism();
    playRejectMechanism();
  });

  setMechanicalAudioConfig({ enabled: true, volume: 45 });
  assert.doesNotThrow(() => {
    playWheelDetent(5);
    playKeyboardEngage(0);
    playReverseDetent(4);
    playWheelSettle(2, 0.1);
    playUnlockMechanism();
    playRejectMechanism();
  });
});
