/// <reference path="../binding" />
/// <reference path="../../config/config" />
/// <reference path="../../promise/promise" />

module drunk {

    export interface IActionExecutor {
        (element: HTMLElement, ondone: Function): () => void;
    }

    export interface IActionDefinition {
        created: IActionExecutor;
        removed: IActionExecutor;
    }

    export interface IActionType {
        created: string;
        removed: string;
    }

    export interface IAction {
        cancel?(): void;
        promise?: Promise<any>;
    }

    /**
     * 动画模块
     * @module drunk.Action
     * @class Action
     */
    export module Action {
        
        /**
         * action的类型
         * @property Type
         * @type object
         */
        export let Type = {
            created: 'created',
            removed: 'removed'
        };
        
        /**
         * js动画定义
         * @property definitionMap
         * @private
         * @type object
         */
        let definitionMap: { [name: string]: IActionDefinition } = {};
        
        /**
         * 动画状态
         * @property actionMap
         * @private
         * @type object
         */
        let actionMap: { [id: number]: IAction } = {};

        let propertyPrefix: string = null;
        let transitionEndEvent: string = null;
        let animationEndEvent: string = null;

        function getPropertyName(property: string) {
            if (propertyPrefix === null) {
                let style = document.body.style;

                if ('webkitAnimationDuration' in style) {
                    propertyPrefix = 'webkit';
                    transitionEndEvent = 'webkitTransitionEnd';
                    animationEndEvent = 'webkitAnimationEnd';
                }
                else if ('mozAnimationDuration' in style) {
                    propertyPrefix = 'moz';
                }
                else if ('msAnimationDuration' in style) {
                    propertyPrefix = 'ms';
                }
                else {
                    propertyPrefix = '';
                }

                if (!transitionEndEvent && !animationEndEvent) {
                    // 只有webkit的浏览器是用特定的事件,其他的浏览器统一用一下两个事件
                    transitionEndEvent = 'transitionend';
                    animationEndEvent = 'animationend';
                }
            }

            if (!propertyPrefix) {
                return property;
            }

            return propertyPrefix + (property.charAt(0).toUpperCase() + property.slice(1));
        }

        /**
         * 设置当前正在执行的action
         * @method setCurrentAction
         * @static
         * @param  {HTMLElement}  element 元素节点
         * @param  {IAction}      action  action描述
         */
        export function setCurrentAction(element: HTMLElement, action: IAction) {
            let id = util.uuid(element);
            actionMap[id] = action;
        }
        
        /**
         * 获取元素当前的action对象
         * @method getCurrentAction
         * @static
         * @param  {HTMLElement}  element  元素节点
         * @return {IAction}
         */
        export function getCurrentAction(element: HTMLElement) {
            let id = util.uuid(element);
            return actionMap[id];
        }
        
        /**
         * 移除当前元素的action引用
         * @method removeRef
         * @static
         * @param  {HTMLElement} element
         */
        export function removeRef(element: HTMLElement) {
            let id = util.uuid(element);
            actionMap[id] = null;
        }
        
        /**
         * 执行单个action,优先判断是否存在js定义的action,再判断是否是css动画
         * @method run
         * @static
         * @param  {HTMLElement}    element    元素对象
         * @param  {string}         detail     action的信息,动画名或延迟时间
         * @param  {string}         type       action的类型(created或removed)
         */
        export function run(element: HTMLElement, detail: string, type: string) {
            if (!isNaN(Number(detail))) {
                // 如果是一个数字,则为延时等待操作
                return wait(<any>detail * 1000);
            }

            let definition = definitionMap[detail];
            if (definition) {
                // 如果有通过js注册的action,优先执行
                return runJavascriptAction(element, definition, type);
            }

            return runMaybeCSSAnimation(element, detail, type);
        }

        function wait(time: number) {
            let action: IAction = {};
            
            action.promise = new Promise((resolve) => {
                let timerid;
                action.cancel = () => {
                    clearTimeout(timerid);
                    action.cancel = null;
                    action.promise = null;
                };
                timerid = setTimeout(resolve, time);
            });

            return action;
        }

        function runJavascriptAction(element: HTMLElement, definition: IActionDefinition, type) {
            let action: IAction = {};
            let executor: IActionExecutor = definition[type];

            action.promise = new Promise((resolve) => {
                let cancel = executor(element, () => {
                    resolve();
                });
                
                action.cancel = () => {
                    action.cancel = null;
                    action.promise = null;
                    cancel();
                };
            });

            return action;
        }

        function runMaybeCSSAnimation(element: HTMLElement, detail: string, type: string) {
            detail = detail ? detail + '-' : config.prefix;

            let action: IAction = {};
            let className = detail + type;
            
            // 如果transitionDuration或animationDuration都不为0s的话说明已经设置了该属性
            // 必须先在这里取一次transitionDuration的值,动画才会生效
            let style = getComputedStyle(element, null);
            let transitionExist = style[getPropertyName('transitionDuration')] !== '0s';

            action.promise = new Promise((resolve) => {
                // 给样式赋值后,取animationDuration的值,判断有没有设置animation动画
                element.classList.add(className);
                let animationExist = style[getPropertyName('animationDuration')] !== '0s';

                if (!transitionExist && !animationExist) {
                    // 如果为设置动画直接返回resolve状态
                    return resolve();
                }
                
                element.style[getPropertyName('animationFillMode')] = 'both';

                function onTransitionEnd() {
                    element.removeEventListener(animationEndEvent, onAnimationEnd, false);
                    element.removeEventListener(transitionEndEvent, onTransitionEnd, false);

                    if (type === Type.removed) {
                        element.classList.remove(detail + Type.created, className);
                    }
                    resolve();
                }
                function onAnimationEnd() {
                    element.removeEventListener(transitionEndEvent, onTransitionEnd, false);
                    element.removeEventListener(animationEndEvent, onAnimationEnd, false);
                    resolve();
                }

                element.addEventListener(animationEndEvent, onAnimationEnd, false);
                element.addEventListener(transitionEndEvent, onTransitionEnd, false);

                action.cancel = () => {
                    element.removeEventListener(transitionEndEvent, onTransitionEnd, false);
                    element.removeEventListener(animationEndEvent, onAnimationEnd, false);
                    element.classList.remove(className);
                    action.cancel = null;
                    action.promise = null;
                };
            });

            return action;
        }
        
        /**
         * 判断元素是否正在处理action,返回promise对象
         * @method processAll
         * @static
         * @param  {HTMLElement}  element 元素节点
         * @return {Promise}
         */
        export function processAll(element: HTMLElement) {
            let currentAction = getCurrentAction(element);
            return Promise.resolve(currentAction && currentAction.promise);
        }

        /**
         * 注册一个js action
         * @method define
         * @param  {string}              name        动画名称
         * @param  {IActionDefinition}   definition  动画定义
         */
        export function define<T extends IActionDefinition>(name: string, definition: T) {
            if (definitionMap[name] != null) {
                console.warn(name, "动画已经被覆盖为", definition);
            }

            definitionMap[name] = definition;
        }
        
        /**
         * 根据名称获取注册的action实现
         * @method getDefinition
         * @static
         * @param  {string}  name  action名称
         * @return {IActionDefinition}
         */
        export function getDefinition(name: string) {
            return definitionMap[name];
        }
    }

    /**
     * action绑定的实现
     */
    class ActionBinding {

        element: HTMLElement;
        expression: string;
        viewModel: Component;

        private _actions: string[];

        init() {
            this._runActionByType(Action.Type.created);
        }

        _parseDefinition(actionType: string) {
            if (!this.expression) {
                this._actions = [];
            }
            else {
                let str: string = this.viewModel.eval(this.expression, true);
                this._actions = str.split(/\s+/);

                if (actionType === Action.Type.removed) {
                    this._actions.reverse();
                }
            }
        }

        _runActions(type: string) {
            let element = this.element;

            if (this._actions.length < 2) {
                let action = Action.run(element, this._actions[0], type);
                action.promise.then(() => {
                    Action.removeRef(element);
                });
                return Action.setCurrentAction(element, action);
            }

            let actionQueue: IAction = {};
            let actions = this._actions;

            actionQueue.promise = new Promise((resolve) => {
                let index = 0;
                let runAction = () => {
                    let detail = actions[index++];

                    if (typeof detail === 'undefined') {
                        actionQueue.cancel = null;
                        actionQueue.promise = null;
                        Action.removeRef(element);
                        return resolve();
                    }

                    let currentAction = Action.run(element, detail, type);
                    currentAction.promise.then(runAction);
                    actionQueue.cancel = () => {
                        currentAction.cancel();
                        actionQueue.cancel = null;
                        actionQueue.promise = null;
                    };
                };

                runAction();
            });

            Action.setCurrentAction(element, actionQueue);
        }

        _runActionByType(type: string) {
            let currentAction = Action.getCurrentAction(this.element);
            if (currentAction && currentAction.cancel) {
                currentAction.cancel();
            }
            this._parseDefinition(type);
            this._runActions(type);
        }

        release() {
            this._runActionByType(Action.Type.removed);
            this._actions = null;
        }
    }

    Binding.define('action', ActionBinding.prototype);
}