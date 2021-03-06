/// <reference path="../util/util.ts" />

namespace drunk {
    
    import util = drunk.util;
    
    export interface IEventListener {
        (...args: any[]): void;
        __isOnce?: boolean;
    }
    
    let eventCache: {[id: number]: {[type: string]: IEventListener[]}} = {};
    let prefixKey = 'DRUNK-ONCE-EVENT-';
    
    function getCache(emitter: EventEmitter) {
        let id = util.uniqueId(emitter);
        
        if (!eventCache[id]) {
            eventCache[id] = {};
        }
        
        return eventCache[id];
    }
    
    /**
     * 事件管理类
     */
    export class EventEmitter {
        
        /**
         * 注册事件
         * @param  type       事件类型
         * @param  listener   事件回调
         */
        $addListener(type: string, listener: IEventListener) {
            let cache = getCache(this);
            
            if (!cache[type]) {
                cache[type] = [];
            }
            
            util.addArrayItem(cache[type], listener);
            return this;
        }
        
        /**
         * 注册事件,$addListener方法的别名
         * @param   type       事件类型
         * @param   listener   事件回调
         */
        $on(type: string, listener: IEventListener) {
            return this.$addListener(type, listener);
        }
        
        /**
         * 注册一次性事件
         * @param   type      事件类型
         * @param   listener  事件回调
         */
        $once(type: string, listener: IEventListener) {
            listener[prefixKey + util.uniqueId(this)] = true;
            this.$addListener(type, listener);
            return this;
        }
        
        /**
         * 移除指定类型的事件监听
         * @param   type     事件类型
         * @param   listener 事件回调
         */
        $removeListener(type: string, listener: IEventListener) {
            let cache = getCache(this);
            let listeners = cache[type];
            
            if (!listeners || !listeners.length) {
                return;
            }
            
            util.removeArrayItem(listeners, listener);
            return this;
        }
        
        /**
         * 移除所有指定类型的事件,或当事件类型未提供时,移除所有该实例上所有的事件
         * @param   type  事件类型，可选
         */
        $removeAllListeners(type?: string) {
            if (!type) {
                EventEmitter.cleanup(this);
            }
            else {
                getCache(this)[type] = null;
            }
            return this;
        }
        
        /**
         * 派发指定类型事件
         * @param   type        事件类型
         * @param   ...args     其他参数
         */
        $emit(type: string, ...args: any[]) {
            let cache = getCache(this);
            let listeners = cache[type];
            let onceKey = prefixKey + util.uniqueId(this);
            
            if (!listeners || !listeners.length) {
                return;
            }
            
            listeners.slice().forEach((listener) => {
                listener.apply(this, args);
                
                if (listener[onceKey]) {
                    util.removeArrayItem(listeners, listener);
                    delete listener[onceKey];
                }
            });
            
            return this;
        }
        
        /**
         * 获取指定事件类型的所有listener回调
         * @param   type  事件类型
         */
        $listeners(type: string): IEventListener[] {
            var listeners: IEventListener[] = getCache(this)[type];
            return listeners ? listeners.slice() : [];
        }
        
        /**
         * 获取事件实例的指定事件类型的回调技术
         * @param  emitter  事件类实例
         * @param  type     事件类型
         */
        static listenerCount(emitter: EventEmitter, type: string): number {
            let cache = getCache(emitter);
            
            if (!cache[type]) {
                return 0;
            }
            
            return cache[type].length;
        }
        
        /**
         * 移除对象的所有事件回调引用
         * @param  emitter  事件发射器实例
         */
        static cleanup(emitter: EventEmitter) {
            let id = util.uniqueId(emitter);
            eventCache[id] = null;
        }
    }
}