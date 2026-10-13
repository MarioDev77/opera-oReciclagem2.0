/* ===== Carregamento de sprites ===== */
const SPRITE_NAMES = [
  'crisoman_idle','crisoman_run1','crisoman_run2','crisoman_celebrate','crisoman_hurt','crisoman_victory',
  'crisogril_idle','crisogril_run1','crisogril_run2','crisogril_celebrate','crisogril_hurt','crisogril_victory',
  'bin_metal','bin_plastic','bin_glass','bin_paper',
  'mat_metal_can','mat_pet_bottle','mat_plastic_pack','mat_glass_bottle','mat_broken_glass',
  'mat_paper','mat_newspaper','mat_cardboard','mat_organic','mat_trash',
  'item_clock','item_star','item_shield','item_magnet','item_eco','item_hazard',
];

const Sprites = {
  images: {},
  backgrounds: {},
  loaded: 0,
  total: SPRITE_NAMES.length + 9,
  onProgress: null,

  loadAll() {
    SPRITE_NAMES.forEach(name => {
      const img = new Image();
      img.onload = () => this._tick();
      img.onerror = () => this._tick();
      img.src = 'assets/sprites/' + name + '.png';
      this.images[name] = img;
    });
    for (let i = 1; i <= 9; i++) {
      const img = new Image();
      img.onload = () => this._tick();
      img.onerror = () => this._tick();
      img.src = 'assets/backgrounds/bg' + i + '.jpg';
      this.backgrounds[i] = img;
    }
  },

  _tick() {
    this.loaded++;
    if (this.onProgress) this.onProgress(this.loaded, this.total);
  },

  get(name) { return this.images[name]; },
  bg(n) { return this.backgrounds[n]; },
};
