import { BasePlugin } from '../../core/BasePlugin.js';

export class EventsPlugin extends BasePlugin {
  #eventBus = null;

  get name() {
    return 'events';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger'];
  }

  async onInit() {
    this.#eventBus = this.kernel.events;
    
    this.kernel.services.register('events', () => ({
      on: this.on.bind(this),
      once: this.once.bind(this),
      off: this.off.bind(this),
      emit: this.emit.bind(this),
      emitSync: this.emitSync.bind(this),
      middleware: this.middleware.bind(this),
      getStats: this.getStats.bind(this)
    }), { singleton: true });

    this.logger.info('EventsPlugin initialized');
  }

  on(event, handler, options = {}) {
    return this.#eventBus.on(event, handler, options);
  }

  once(event, handler, options = {}) {
    return this.#eventBus.once(event, handler, options);
  }

  off(event, handler) {
    this.#eventBus.off(event, handler);
    return this;
  }

  emit(event, data) {
    return this.#eventBus.emit(event, data);
  }

  emitSync(event, data) {
    return this.#eventBus.emitSync(event, data);
  }

  middleware(fn) {
    this.#eventBus.use(fn);
    return this;
  }

  getStats() {
    return this.#eventBus.getStats();
  }

  async onDestroy() {
    this.logger.info('EventsPlugin destroyed');
  }
}
