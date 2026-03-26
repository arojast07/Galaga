/**
 * PowerUp.js
 * Power-up con efectos visuales mejorados:
 * - Caida fluida con leve oscilacion horizontal
 * - Rotacion continua
 * - Pulso de escala (glow efecto)
 * - Particulas al aparecer
 * - Texto flotante al ser recogido (emitido via evento)
 */
class PowerUp extends Phaser.Physics.Arcade.Sprite {

  static getDuration(type) {
    var d = { double: 8000, fast: 6000, shield: 7000 };
    return d[type] || 6000;
  }

  constructor(scene, x, y, type) {
    var textureMap = {
      double: 'powerup_double',
      fast:   'powerup_fast',
      shield: 'powerup_shield',
    };
    super(scene, x, y, textureMap[type] || 'powerup_double');
    this.powerType  = type;
    this._spawnX    = x;
    this._fallSpeed = 85;
    this._oscTime   = 0;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(6);

    if (this.body) {
      this.body.setVelocityY(this._fallSpeed);
      this.body.allowGravity = false;
    }

    // Rotacion continua
    scene.tweens.add({
      targets: this,
      angle: 360,
      duration: 1600,
      repeat: -1,
    });

    // Pulso de escala (efecto glow)
    scene.tweens.add({
      targets: this,
      scaleX: 1.25, scaleY: 1.25,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Particulas al aparecer
    this._spawnBurst(scene, x, y, type);

    // Auto-destruccion a los 7s con parpadeo
    var self = this;
    scene.time.delayedCall(5500, function() {
      if (!self.active || !self.scene) return;
      scene.tweens.add({
        targets: self,
        alpha: 0, duration: 130, yoyo: true, repeat: 7,
        onComplete: function() { if (self.active) self.destroy(); },
      });
    });
  }

  _spawnBurst(scene, x, y, type) {
    var colors = { double: 0x00ffcc, fast: 0xffff00, shield: 0x8888ff };
    var color  = colors[type] || 0xffffff;
    for (var i = 0; i < 8; i++) {
      var angle = (i / 8) * Math.PI * 2;
      var dist  = Phaser.Math.Between(20, 45);
      var p = scene.add.circle(x, y, 3, color, 0.9).setDepth(7);
      scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0, scaleY: 0,
        duration: 400,
        ease: 'Power2',
        onComplete: function() { p.destroy(); },
      });
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (!this.active) return;

    // Garantizar velocidad de caida
    if (this.body && this.body.velocity.y < 10) {
      this.body.setVelocityY(this._fallSpeed);
      this.body.allowGravity = false;
    }

    // Oscilacion horizontal suave
    this._oscTime += delta * 0.002;
    if (this.body) {
      this.body.setVelocityX(Math.sin(this._oscTime) * 30);
    }

    if (this.y > this.scene.scale.height + 30) {
      this.destroy();
    }
  }
}
