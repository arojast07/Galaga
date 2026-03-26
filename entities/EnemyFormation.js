/**
 * EnemyFormation.js
 * Gestiona la formacion de enemigos por oleada.
 *
 * MINIBOSS: aparece en oleadas multiplo de 3 (3, 6, 9...).
 * En esas oleadas la formacion normal se reemplaza por el miniboss solo,
 * con stats escalados segun la oleada.
 */
class EnemyFormation {
  constructor(scene, wave, enemyBulletsGroup) {
    this.scene        = scene;
    this.wave         = wave;
    this.enemies      = scene.physics.add.group({ runChildUpdate: false });
    this.enemyBullets = enemyBulletsGroup;

    this.formationDx  = 0;
    this.formationDir = 1;
    this.formationSpd = 28 + wave * 4;
    this.formationMax = 80;

    this.diveInterval = Math.max(900, 3500 - wave * 160);
    this.diveTimer    = 0;
    this.maxSimultaneousDives = Math.min(1 + Math.floor(wave / 3), 4);

    this.isBossWave = (wave % 3 === 0);

    this._buildFormation();
  }

  _buildFormation() {
    var w    = this.scene.scale.width;
    var wave = this.wave;

    var speedMult    = 1 + (wave - 1) * 0.12;
    var fireRateMult = Math.max(0.4, 1 - (wave - 1) * 0.07);

    if (this.isBossWave) {
      // Oleada de miniboss: solo el boss, sin formacion normal
      var cfg  = this._getEnemyConfig('miniboss', speedMult, fireRateMult);
      var boss = new Enemy(this.scene, w / 2, -80, 'miniboss', cfg);
      boss.formationX   = w / 2;
      boss.formationY   = 120;
      boss.enemyBullets = this.enemyBullets;
      this.enemies.add(boss);
      return;
    }

    // Formacion normal
    var rows = [
      { type: wave >= 3 ? 'tough' : 'basic', count: Math.min(4 + Math.floor(wave / 2), 8),  y: 110 },
      { type: 'basic',                        count: Math.min(6 + Math.floor(wave / 3), 10), y: 155 },
      { type: 'basic',                        count: Math.min(6 + Math.floor(wave / 3), 10), y: 200 },
      { type: 'fast',                         count: Math.min(4 + Math.floor(wave / 2), 8),  y: 245 },
    ];

    for (var r = 0; r < rows.length; r++) {
      var row     = rows[r];
      var spacing = Math.min(52, (w - 60) / row.count);
      var totalW  = spacing * (row.count - 1);
      var startX  = (w - totalW) / 2;

      for (var i = 0; i < row.count; i++) {
        var fx  = startX + i * spacing;
        var cfg = this._getEnemyConfig(row.type, speedMult, fireRateMult);
        var enemy = new Enemy(this.scene, fx, -60 - i * 15, row.type, cfg);
        enemy.formationX   = fx;
        enemy.formationY   = row.y;
        enemy.enemyBullets = this.enemyBullets;
        this.enemies.add(enemy);
      }
    }
  }

  _getEnemyConfig(type, speedMult, fireRateMult) {
    // Miniboss escala mas agresivamente con la oleada
    var bossHpScale = Math.floor(this.wave / 3);
    var base = {
      basic:    { hp: 1,                       points: 100,  speed: 55,  fireRate: 3200 },
      fast:     { hp: 1,                       points: 150,  speed: 90,  fireRate: 2200 },
      tough:    { hp: 3,                       points: 300,  speed: 40,  fireRate: 2800 },
      miniboss: { hp: 15 + bossHpScale * 5,   points: 1000 + bossHpScale * 500,
                  speed: 40, fireRate: 1000 },
    };
    var b = base[type] || base.basic;
    return {
      hp:       b.hp,
      points:   b.points,
      speed:    b.speed * speedMult,
      fireRate: b.fireRate * fireRateMult,
      wave:     this.wave,
    };
  }

  update(time, delta, playerXPositions) {
    // En modo guest no correr IA local — el host envia snapshots
    if (this._guestMode) return;

    this.formationDx += this.formationDir * this.formationSpd * (delta / 1000);
    if (Math.abs(this.formationDx) > this.formationMax) {
      this.formationDir *= -1;
    }

    var children = this.enemies.getChildren();
    for (var i = 0; i < children.length; i++) {
      if (children[i].active) children[i].update(time, delta, this.formationDx);
    }

    this.diveTimer += delta;
    if (this.diveTimer >= this.diveInterval) {
      this.diveTimer = 0;
      this._launchDive(playerXPositions);
    }
  }

  _launchDive(playerXPositions) {
    var children = this.enemies.getChildren();
    var diving = 0;
    for (var i = 0; i < children.length; i++) {
      if (children[i].active && children[i].state === 'diving') diving++;
    }
    if (diving >= this.maxSimultaneousDives) return;

    var candidates = [];
    for (var j = 0; j < children.length; j++) {
      if (children[j].active && children[j].state === 'formation') candidates.push(children[j]);
    }
    if (candidates.length === 0) return;

    candidates.sort(function(a, b) { return b.formationY - a.formationY; });
    var pool   = candidates.slice(0, Math.min(3, candidates.length));
    var chosen = pool[Phaser.Math.Between(0, pool.length - 1)];
    var targetX = playerXPositions[Phaser.Math.Between(0, playerXPositions.length - 1)];
    chosen.startDive(targetX);
  }

  isEmpty() {
    return this.enemies.countActive(true) === 0;
  }

  destroy() {
    this.enemies.clear(true, true);
  }
}
