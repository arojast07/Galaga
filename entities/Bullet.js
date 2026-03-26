/**
 * Bullet.js
 * Bala reutilizable (pool) para jugador y enemigos.
 * Siempre se recicla: nunca se destruye, solo se desactiva.
 *
 * ARQUITECTURA MULTIPLAYER:
 * El campo `ownerIndex` (0 = jugador 1, 1 = jugador 2, -1 = enemigo)
 * permite distinguir a quién pertenece cada bala sin acoplar la lógica.
 */
class Bullet extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture) {
    super(scene, x, y, texture);
    // Índice del dueño: 0=P1, 1=P2, -1=enemigo
    this.ownerIndex = -1;
    // Identificador estable para online (asignado en cada disparo)
    this.netId = null;
  }

  /**
   * Activa la bala en la posición dada con velocidad vertical.
   * @param {number} x
   * @param {number} y
   * @param {number} velocityY  negativo = sube (jugador), positivo = baja (enemigo)
   * @param {number} [ownerIndex=-1]
   * @param {string|null} [netId=null]
   */
  fire(x, y, velocityY, ownerIndex = -1, netId = null) {
    this.ownerIndex = ownerIndex;
    this.netId = netId;
    this.setActive(true).setVisible(true);
    this.setPosition(x, y);
    if (this.body) this.body.reset(x, y);
    this.setVelocityY(velocityY);
  }

  /**
   * Devuelve la bala al pool desactivándola de forma segura.
   * Funciona aunque el body sea null (Phaser lo puede limpiar antes).
   */
  kill() {
    this.setActive(false).setVisible(false);
    if (this.body) {
      this.body.reset(0, -200);
      this.setVelocity(0, 0);
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (!this.active) return;
    const h = this.scene.scale.height;
    const w = this.scene.scale.width;
    if (this.y < -30 || this.y > h + 30 || this.x < -30 || this.x > w + 30) {
      this.kill();
    }
  }
}
