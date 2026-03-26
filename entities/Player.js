// Player.js - Nave del jugador con modo furia, power-ups y multiplayer
class Player extends Phaser.Physics.Arcade.Sprite {

  static getKeyConfig(index) {
    if (index === 1) {
      return { left: Phaser.Input.Keyboard.KeyCodes.LEFT, right: Phaser.Input.Keyboard.KeyCodes.RIGHT, fire: Phaser.Input.Keyboard.KeyCodes.SHIFT, altLeft: null, altRight: null };
    }
    return { left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D, fire: Phaser.Input.Keyboard.KeyCodes.SPACE, altLeft: null, altRight: null };
  }

  constructor(scene, x, y, playerIndex, keyConfig) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.playerIndex = (playerIndex !== undefined) ? playerIndex : 0;
    this.setCollideWorldBounds(true);
    if (this.playerIndex === 1) this.setTint(0xff9900);
    this.lives = 3; this.isInvincible = false; this.isDead = false;
    this.activePowerUp = null; this.fireMode = 'single'; this.fireRate = 300; this.lastFired = 0;
    this.shieldActive = false; this.shieldTimer = null;
    this.furyCharge = 0; this.furyMax = 20; this.furyActive = false; this.furyTimer = null;
    this.furyDuration = 6000; this.furyMultiplier = 1;
    this.shieldFx = scene.add.image(x, y, 'shield_fx').setVisible(false).setDepth(7);
    this.furyGlow = scene.add.circle(x, y, 28, 0xff4400, 0).setDepth(6);
    this.puBar = scene.add.graphics().setDepth(8);
    this.furyBar = scene.add.graphics().setDepth(8);
    var cfg = keyConfig || Player.getKeyConfig(this.playerIndex);
    this.keyLeft = scene.input.keyboard.addKey(cfg.left);
    this.keyRight = scene.input.keyboard.addKey(cfg.right);
    this.keyFire = scene.input.keyboard.addKey(cfg.fire);
    this.keyAltLeft = cfg.altLeft ? scene.input.keyboard.addKey(cfg.altLeft) : null;
    this.keyAltRight = cfg.altRight ? scene.input.keyboard.addKey(cfg.altRight) : null;
    this.bullets = scene.physics.add.group({ classType: Bullet, maxSize: 30, runChildUpdate: true });
    this._shotSeq = 0; // para IDs estables de red
  }

  handleUpdate(time, paused) {
    if (paused || this.isDead) return;
    var speed = 220;
    var goLeft = this.keyLeft.isDown || (this.keyAltLeft && this.keyAltLeft.isDown);
    var goRight = this.keyRight.isDown || (this.keyAltRight && this.keyAltRight.isDown);
    if (goLeft) this.setVelocityX(-speed);
    else if (goRight) this.setVelocityX(speed);
    else this.setVelocityX(0);
    var effectiveRate = this.furyActive ? 80 : this.fireRate;
    if (this.keyFire.isDown && time > this.lastFired + effectiveRate) this._shoot(time);
    this.shieldFx.setPosition(this.x, this.y).setVisible(this.shieldActive);
    this.furyGlow.setPosition(this.x, this.y);
    this._updatePuBar(time);
    this._updateFuryBar();
  }

  _shoot(time) {
    this.lastFired = time;
    var mode = this.furyActive ? 'triple' : this.fireMode;
    if (mode === 'triple') { this._spawnBullet(this.x - 12, this.y - 10); this._spawnBullet(this.x, this.y - 16); this._spawnBullet(this.x + 12, this.y - 10); }
    else if (mode === 'double') { this._spawnBullet(this.x - 10, this.y - 10); this._spawnBullet(this.x + 10, this.y - 10); }
    else this._spawnBullet(this.x, this.y - 10);
    this._playSfxShoot();
  }

  _spawnBullet(x, y) {
    var b = this.bullets.get(x, y, 'bullet_player');
    if (!b) return;
    b.setDepth(5);
    // ID estable para sincronizacion online (debe regenerarse en cada disparo: el sprite se reutiliza del pool)
    var netId = 'p' + this.playerIndex + '_' + Math.floor(this.scene.time.now) + '_' + (this._shotSeq++);
    b.fire(x, y, this.furyActive ? -680 : -520, this.playerIndex, netId);
    if (this.furyActive) b.setTint(0xff6600); else b.clearTint();
  }

  addFuryCharge(amount) {
    if (this.furyActive) return;
    this.furyCharge = Math.min(this.furyCharge + (amount || 1), this.furyMax);
    if (this.furyCharge >= this.furyMax) this._activateFury();
    this.scene.events.emit('updateFury', this.playerIndex, this.furyCharge, this.furyMax, this.furyActive);
  }

  _activateFury() {
    this.furyActive = true; this.furyMultiplier = 2; this.isInvincible = true;
    this.setTint(0xff4400);
    this.scene.tweens.add({ targets: this.furyGlow, alpha: 0.55, scaleX: 1.7, scaleY: 1.7, duration: 280, yoyo: true, repeat: -1 });
    this.scene.events.emit('furyActivated', this.playerIndex);
    this.scene.events.emit('updateFury', this.playerIndex, this.furyMax, this.furyMax, true);
    this._playSfxFury();
    if (this.furyTimer) this.furyTimer.remove();
    var self = this;
    this.furyTimer = this.scene.time.delayedCall(this.furyDuration, function() { self._deactivateFury(); });
  }

  _deactivateFury() {
    this.furyActive = false; this.furyMultiplier = 1; this.furyCharge = 0; this.isInvincible = false;
    if (this.playerIndex === 1) this.setTint(0xff9900); else this.clearTint();
    this.scene.tweens.killTweensOf(this.furyGlow);
    this.furyGlow.setAlpha(0).setScale(1);
    this.scene.events.emit('furyDeactivated', this.playerIndex);
    this.scene.events.emit('updateFury', this.playerIndex, 0, this.furyMax, false);
  }

  hit() {
    if (this.isInvincible || this.isDead) return false;
    if (this.shieldActive) { this._removeShield(); this._flashInvincible(500); return false; }
    this.lives = Math.max(0, this.lives - 1);
    this._playSfxExplosion();
    if (this.lives <= 0) {
      this.isDead = true; this.setVisible(false);
      if (this.shieldFx) this.shieldFx.setVisible(false);
      if (this.puBar) this.puBar.setVisible(false);
      if (this.furyBar) this.furyBar.setVisible(false);
      if (this.furyGlow) this.furyGlow.setVisible(false);
      return true;
    }
    this._flashInvincible(2000);
    return false;
  }

  takeDamage() { return this.hit(); }

  _flashInvincible(duration) {
    this.isInvincible = true;
    this.scene.tweens.killTweensOf(this);
    var self = this;
    this.scene.tweens.add({
      targets: this, alpha: 0, duration: 120, yoyo: true,
      repeat: Math.floor(duration / 240),
      onComplete: function() { if (self && self.scene) { self.setAlpha(1); if (!self.furyActive) self.isInvincible = false; } }
    });
  }

  respawn() {
    this.isDead = false; this.setVisible(true).setAlpha(1);
    if (this.puBar) this.puBar.setVisible(true);
    if (this.furyBar) this.furyBar.setVisible(true);
    if (this.furyGlow) this.furyGlow.setVisible(true);
    this.setPosition(this.scene.scale.width / 2, this.scene.scale.height - 60);
    this._flashInvincible(2500);
  }

  applyPowerUp(type) {
    this._playSfxPowerUp();
    if (this.activePowerUp && this.activePowerUp.type !== type) this._expirePowerUp(this.activePowerUp.type);
    if (this.activePowerUp && this.activePowerUp.timer) this.activePowerUp.timer.remove();
    var durations = { double: 8000, fast: 6000, shield: 7000 };
    var duration = durations[type] || 6000;
    var expiresAt = this.scene.time.now + duration;
    var self = this;
    var timer = this.scene.time.delayedCall(duration, function() { self._expirePowerUp(type); });
    this.activePowerUp = { type: type, expiresAt: expiresAt, timer: timer };
    if (type === 'double') this.fireMode = 'double';
    else if (type === 'fast') this.fireRate = 120;
    else if (type === 'shield') this._activateShield(duration);
    this.scene.events.emit('updatePowerUp', this.playerIndex, type, duration);
  }

  _expirePowerUp(type) {
    if (type === 'double') this.fireMode = 'single';
    if (type === 'fast') this.fireRate = 300;
    if (type === 'shield') this._removeShield();
    if (this.activePowerUp && this.activePowerUp.type === type) this.activePowerUp = null;
    this.scene.events.emit('updatePowerUp', this.playerIndex, null, 0);
  }

  _activateShield(duration) {
    this.shieldActive = true;
    if (this.shieldTimer) this.shieldTimer.remove();
    var self = this;
    this.shieldTimer = this.scene.time.delayedCall(duration, function() { self._removeShield(); });
  }

  _removeShield() {
    this.shieldActive = false;
    if (this.shieldFx) this.shieldFx.setVisible(false);
    if (this.shieldTimer) { this.shieldTimer.remove(); this.shieldTimer = null; }
  }

  _updatePuBar(time) {
    if (!this.puBar) return;
    this.puBar.clear();
    if (!this.activePowerUp) return;
    var durations = { double: 8000, fast: 6000, shield: 7000 };
    var total = durations[this.activePowerUp.type] || 6000;
    var ratio = Math.max(0, (this.activePowerUp.expiresAt - time) / total);
    var bx = this.x - 18, by = this.y - 32;
    this.puBar.fillStyle(0x333333, 0.8); this.puBar.fillRect(bx, by, 36, 4);
    var colors = { double: 0x00ffcc, fast: 0xffff00, shield: 0x8888ff };
    this.puBar.fillStyle(colors[this.activePowerUp.type] || 0xffffff, 1);
    this.puBar.fillRect(bx, by, 36 * ratio, 4);
  }

  _updateFuryBar() {
    if (!this.furyBar) return;
    this.furyBar.clear();
    if (this.furyActive) return;
    var ratio = this.furyCharge / this.furyMax;
    var bx = this.x - 18, by = this.y - 38;
    this.furyBar.fillStyle(0x222222, 0.8); this.furyBar.fillRect(bx, by, 36, 4);
    var color = ratio > 0.7 ? 0xff2200 : ratio > 0.4 ? 0xff8800 : 0xffdd00;
    this.furyBar.fillStyle(color, 1); this.furyBar.fillRect(bx, by, 36 * ratio, 4);
  }

  _playSfxShoot() {
    try {
      var ctx = this.scene._audioCtx; if (!ctx) return;
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = this.furyActive ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(this.furyActive ? 1200 : 880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  }

  _playSfxExplosion() {
    try {
      var ctx = this.scene._audioCtx; if (!ctx) return;
      var buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
      var src = ctx.createBufferSource(), gain = ctx.createGain();
      src.buffer = buf; gain.gain.setValueAtTime(0.5, ctx.currentTime);
      src.connect(gain); gain.connect(ctx.destination); src.start();
    } catch (e) {}
  }

  _playSfxPowerUp() {
    try {
      var ctx = this.scene._audioCtx; if (!ctx) return;
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  }

  _playSfxFury() {
    try {
      var ctx = this.scene._audioCtx; if (!ctx) return;
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  }

  destroy(fromScene) {
    if (this.shieldFx) { this.shieldFx.destroy(); this.shieldFx = null; }
    if (this.furyGlow) { this.furyGlow.destroy(); this.furyGlow = null; }
    if (this.puBar) { this.puBar.destroy(); this.puBar = null; }
    if (this.furyBar) { this.furyBar.destroy(); this.furyBar = null; }
    if (this.shieldTimer) { this.shieldTimer.remove(); this.shieldTimer = null; }
    if (this.furyTimer) { this.furyTimer.remove(); this.furyTimer = null; }
    super.destroy(fromScene);
  }
}
