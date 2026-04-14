import { BasePlugin } from '../../core/BasePlugin.js';

export class ConfigPlugin extends BasePlugin {
  #configManager = null;

  get name() {
    return 'config';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger'];
  }

  async onInit() {
    this.#configManager = this.kernel.config;
    
    this.kernel.services.register('config', () => ({
      get: this.get.bind(this),
      set: this.set.bind(this),
      has: this.has.bind(this),
      getAll: this.getAll.bind(this),
      loadFromFile: this.loadFromFile.bind(this),
      loadFromEnv: this.loadFromEnv.bind(this),
      watch: this.watch.bind(this),
      unwatch: this.unwatch.bind(this)
    }), { singleton: true });

    this.logger.info('ConfigPlugin initialized');
  }

  get(key, defaultValue = undefined) {
    return this.#configManager.get(key, defaultValue);
  }

  set(key, value) {
    const oldValue = this.#configManager.get(key);
    this.#configManager.set(key, value);
    
    this.kernel.events.emit('config:changed', {
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    });
    
    this.logger.debug(`Config changed: ${key}`);
    return this;
  }

  has(key) {
    return this.#configManager.has(key);
  }

  getAll() {
    return this.#configManager.getAll();
  }

  async loadFromFile(filePath, options = {}) {
    await this.#configManager.loadFromFile(filePath, options);
    this.logger.info(`Config loaded from file: ${filePath}`);
    return this;
  }

  loadFromEnv(prefix = 'HUNDUN_') {
    this.#configManager.loadFromEnv(prefix);
    this.logger.info('Config loaded from environment variables');
    return this;
  }

  watch(key, callback) {
    return this.kernel.events.on('config:changed', (event) => {
      if (event.key === key || event.key.startsWith(`${key}.`)) {
        callback(event);
      }
    });
  }

  unwatch(subscription) {
    subscription.unsubscribe();
  }

  async onDestroy() {
    this.logger.info('ConfigPlugin destroyed');
  }
}
