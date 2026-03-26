/**
 * Enemy.js
 * Enemigo con IA: entrada en formacion, movimiento ondulante,
 * ataques de descenso y disparo.
 * Tipos: 'basic' | 'fast' | 'tough' | 'miniboss'
 */
class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type, config) {
    const textureMap = {
      basic:    'enemy_basic',
      fast:     'enemy_fast',
      tough:    'enemy_tough',
      miniboss: 'miniboss',
    };
    super(scene, x, y, textureMap[type] || 'enemy_basic');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.enemyType  = type;
    this.hp         = config.hp       || 1;
    this.maxHp      = this.hp;
    this.points     = config.points   || 100;
    this.moveSpeed  = config.speed    || 60;
    this.fireRate   = config.fireRate || 3000;
    this.lastFired  = Phaser.Math.Between(0, config.fireRate || 3000);
    this.wave       = config.wave     || 1;

    this.state      = 'entering';
    this.formationX = x;
    this.formationY = y;
    this.diveTarget = null;
    this.divePhase  = 0;
    this.diveTimer  = 0;

    this.oscOffset  = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.oscSpeed   = Phaser.Math.FloatBetween(1.2, 2.2);
    this.oscAmp     = Phaser.Math.FloatBetween(8, 18);

    // Referencia al grupo de balas enemigas (asignada por EnemyFormation)
    this.enemyBullets = null;
    // IDs estables para online (asignados por EnemyFormation)
    this.netId = null;
    this._shotSeq = 0;

    // Barra de vida solo para miniboss
    this.hpBar = null;
    if (type === 'miniboss') {
      this.hpBar = scene.add.graphics().setDepth(12);
    }
  }

  update(time, delta, formationDx) {
    if (!this.active) return;

    switch (this.state) {
      case 'entering':   this._updateEntering(delta);              break;
      case 'formation':  this._updateFormation(time, formationDx); break;
      case 'diving':     this._updateDiving(delta);                break;
    }

    if (this.state !== 'entering' && this.enemyBullets) {
      this._tryFire(time);
    }

    if (this.hpBar) this._drawHpBar();
  }

  _updateEntering(delta) {
    const dx   = this.formationX - this.x;
    const dy   = this.formationY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) {
      this.setPosition(this.formationX, this.formationY);
      this.setVelocity(0, 0);
      this.state = 'formation';
    } else {
      const spd = this.moveSpeed * 2.5;
      this.setVelocity((dx / dist) * spd, (dy / dist) * spd);
    }
  }

  _updateFormation(time, formationDx) {
    const osc = Math.sin(time * 0.001 * this.oscSpeed + this.oscOffset) * this.oscAmp;
    this.setPosition(this.formationX + formationDx, this.formationY + osc);
    this.setVelocity(0, 0);
  }

  startDive(playerX) {
    if (this.state === 'diving') return;
    this.state       = 'diving';
    this.divePhase   = 0;
    this.diveTimer   = 0;
    this.diveTarget  = playerX;
    this._savedFormX = this.formationX;
    this._savedFormY = this.formationY;
  }

  _updateDiving(delta) {
    this.diveTimer += delta;
    const w   = this.scene.scale.width;
    const h   = this.scene.scale.height;
    const spd = this.moveSpeed * 2.2;

    if (this.divePhase === 0) {
      const dx   = this.diveTarget - this.x;
      const dy   = (h + 60) - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 8 || this.y > h + 40) {
        this.divePhase = 1;
        this.setPosition(this.x < w / 2 ? w + 40 : -40, Phaser.Math.Between(80, 200));
      } else {
        this.setVelocity((dx / dist) * spd, (dy / dist) * spd);
      }
    } else {
      const dx   = this._savedFormX - this.x;
      const dy   = this._savedFormY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 6) {
        this.setPosition(this._savedFormX, this._savedFormY);
        this.setVelocity(0, 0);
        this.state = 'formation';
      } else {
        this.setVelocity((dx / dist) * spd * 1.5, (dy / dist) * spd * 1.5);
      }
    }
  }

  _tryFire(time) {
    if (time - this.lastFired < this.fireRate) return;
    this.lastFired = time;
    const b = this.enemyBullets.get(this.x, this.y + 16, 'bullet_enemy');
    if (!b) return;
    b.setDepth(4);
    const bid = (this.netId ? this.netId : ('enemy_w' + this.wave)) + '_b' + (this._shotSeq++);
    b.fire(this.x, this.y + 16, 280 + this.wave * 15, -1, bid);
    this._playSfxEnemyShoot();
  }

  /**
   * @returns {boolean} true si murio
   */
  takeDamage(amount) {
    this.hp -= amount;
    this.scene.tweens.add({ targets: this, alpha: 0.2, duration: 60, yoyo: true });
    if (this.hp <= 0) {
      if (this.hpBar) { this.hpBar.destroy(); this.hpBar = null; }
      return true;
    }
    return false;
  }

  _drawHpBar() {
    if (!this.hpBar) return;
    this.hpBar.clear();
    const bw    = 60;
    const bh    = 6;
    const bx    = this.x - bw / 2;
    const by    = this.y + 36;
    const ratio = Math.max(0, this.hp / this.maxHp);
    const color = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffaa00 : 0xff0000;
    this.hpBar.fillStyle(0x333333, 1);
    this.hpBar.fillRect(bx, by, bw, bh);
    this.hpBar.fillStyle(color, 1);
    this.hpBar.fillRect(bx, by, bw * ratio, bh);
  }

  _playSfxEnemyShoot() {
    try {
      const ctx = this.scene._audioCtx;
      if (!ctx) return;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
  }

  destroy(fromScene) {
    if (this.hpBar) { this.hpBar.destroy(); this.hpBar = null; }
    super.destroy(fromScene);
  }
}
