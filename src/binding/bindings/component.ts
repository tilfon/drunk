/// <reference path="./repeat.ts" />
/// <reference path="../binding.ts" />
/// <reference path="../../component/component.ts" />
/// <reference path="../../util/dom.ts" />
/// <reference path="../../template/fragment.ts" />

namespace drunk {

    import dom = drunk.dom;
    import util = drunk.util;
    import Binding = drunk.Binding;
    import renderFragment = drunk.Template.renderFragment;
    import Component = drunk.Component;

    const reOneInterpolate = /^\{\{([^{]+)\}\}$/;
    const reStatement = /(\w+):\s*(.+)/;
    const reSemic = /\s*;\s*/;
    const reBreakword = /\n+/g;

    const getHelpMessage = () => `正确的用法如下:
        ${config.prefix}on="click: expression"
        ${config.prefix}on="mousedown: expression; mouseup: callback()"
        ${config.prefix}on="click: callback($event, $el)"`;

    @binding("component")
    class ComponentBinding extends Binding implements IBindingDefinition {

        static isTerminal = true;
        static priority = Binding.Priority.aboveNormal;

        private _headNode: any;
        private _tailNode: any;
        private _realizePromise: Promise<HTMLElement>;

        component: Component;
        unwatches: Function[];
        properties: { [name: string]: { expression: string; value: any; isDynamic: boolean; }; };
        events: { [name: string]: string };
        isDisposed: boolean;

        /**
         * 初始化组件,找到组件类并生成实例,创建组件的绑定
         */
        init() {
            this.unwatches = [];
            this.properties = {};
            this.events = {};

            var name = this.expression;
            var src = this.element.getAttribute('src');

            this.element.removeAttribute('src');
            if (src) {
                return this._initAsyncComponent(src);
            }

            var ctor = Component.getConstructorByName(name);
            if (!ctor) {
                let resource = Component.getResourceByName(name);
                if (resource != null) {
                    return this._initAsyncComponent(resource);
                }
                throw new Error(name + ": 未找到该组件.");
            }

            this.component = new ctor();
            this._processComponentAttributes();
            return this._realizeComponent();
        }

        /**
         * 初始化异步组件,先加载为fragment,再设置为组件的element,在进行初始化
         */
        private _initAsyncComponent(src: string) {
            return renderFragment(src, null, true).then((fragment) => {
                if (this.isDisposed) {
                    return;
                }

                let Ctor = Component.getConstructorByName(this.expression);
                if (!Ctor) {
                    throw new Error(`${this.expression} : 未找到该组件`);
                }
                this.component = new Ctor();
                this.component.element = util.toArray(fragment.childNodes);

                this._processComponentAttributes();
                return this._realizeComponent();
            }, (error: Error) => {
                if (error && error.message !== 'Canceled') {
                    console.error(`${this.expression}: 组件创建失败\n`, error);
                }
            });
        }

        /**
         * 获取双向绑定的属性名
         */
        private _getTwoWayBindingAttrs() {
            var value = this.element.getAttribute('two-way');
            var attrs: { [name: string]: boolean } = {};

            this.element.removeAttribute('two-way');
            if (value) {
                value.trim().split(/\s+/).forEach((str) => {
                    attrs[util.camelCase(str)] = true;
                });
            }
            return attrs;
        }

        /**
         * 为组件准备数据和绑定事件
         */
        private _processComponentAttributes() {
            var element = this.element;
            var component = this.component;
            var properties = this.properties;
            var twoWayBindingAttrs = this._getTwoWayBindingAttrs();

            this._processEventBinding();

            if (element.hasAttributes()) {

                // 遍历元素上所有的属性做数据准备或数据绑定的处理
                // 如果某个属性用到插值表达式,如"a={{b}}",则对起进行表达式监听(当b改变时通知component的a属性更新到最新的值)
                util.toArray(element.attributes).forEach((attr: Attr) => {
                    let attrName = attr.name;
                    let attrValue = attr.value;

                    if (attrName.indexOf(config.prefix) === 0) {
                        return console.warn(`自定义组件标签上不支持使用"${attrName}"绑定语法`);
                    }
                    if (!attrValue) {
                        component[util.camelCase(attrName)] = true;
                        return;
                    }

                    let expression = attrValue.trim();
                    if (attrName.indexOf("on-") === 0) {
                        // on-click="doSomething()"
                        // => "click", "doSomething()"
                        attrName = util.camelCase(attrName.slice(3));
                        return this._registerComponentEvent(attrName, expression);
                    }

                    attrName = util.camelCase(attrName);

                    if (!Parser.hasInterpolation(expression)) {
                        // 没有插值表达式
                        // title="someConstantValue"
                        let value: any;
                        if (attrValue === 'true') {
                            value = true;
                        } else if (attrValue === 'false') {
                            value = false;
                        } else {
                            value = parseFloat(attrValue);
                            value = isNaN(value) ? attrValue : value;
                        }
                        properties[attrName] = { expression: attrValue, value, isDynamic: false };
                        return component[attrName] = value;
                    }

                    // title="{{somelet}}"
                    this._initComponentWatcher(attrName, expression, twoWayBindingAttrs[attrName]);
                });
            }

            component.$emit(Component.Event.created, component);
        }

        /**
         * 处理组件的视图与数据绑定
         */
        private _realizeComponent() {
            var element = this.element;
            var component = this.component;
            var viewModel = this.viewModel;

            this._realizePromise = component.$processTemplate();

            return this._realizePromise.then(template => {
                if (this.isDisposed) {
                    return;
                }

                let headNode = this._headNode = dom.createFlagNode(`<component>: ${this.expression}`);
                let tailNode = this._tailNode = dom.createFlagNode(`</component>: ${this.expression}`);

                dom.replace(headNode, element);
                dom.after(tailNode, headNode);
                dom.after(template, headNode);

                Binding.setWeakRef(headNode, <any>this);
                Binding.setWeakRef(tailNode, <any>this);

                component.$mount(template, viewModel, element);

                let currNode = headNode.nextSibling;
                let nodeList: any[] = [headNode];

                while (currNode && currNode !== tailNode) {
                    nodeList.push(currNode);
                    currNode = currNode.nextSibling;
                }
                nodeList.push(tailNode);

                if (viewModel instanceof RepeatItem) {
                    if (viewModel._element === element) {
                        viewModel._element = nodeList;
                    }
                }
            }).catch((error: Error) => {
                if (error && error.message !== 'Canceled') {
                    console.error(`${this.expression}: 组件创建失败\n`, error);
                }
            });
        }

        private _processEventBinding() {
            var bindingName = config.prefix + 'on';
            var expression = this.element.getAttribute(bindingName);

            if (expression == null) {
                return;
            }

            this.element.removeAttribute(bindingName);

            expression.replace(reBreakword, ' ').split(reSemic).map(str => {
                let matches = str.match(reStatement);
                console.assert(matches !== null, `不合法的"${config.prefix}on"表达式 ${str}, ${getHelpMessage()}`);
                this._registerComponentEvent(matches[1], matches[2]);
            });
        }

        /**
         * 注册组件的事件
         */
        private _registerComponentEvent(eventName: string, expression: string) {
            var viewModel: Component = this.viewModel;
            var func = Parser.parse(expression);

            this.events[eventName] = expression;

            this.component.$on(eventName, (...args: any[]) => {
                // 事件的处理函数,会生成一个$event对象,在表达式中可以访问该对象.
                // $event对象有type和args两个字段,args字段是组件派发这个事件所传递的参数的列表
                // $el字段为该组件实例
                if (config.debug) {
                    console.log(`${eventName}: ${expression}`);
                }
                func.call(viewModel, {
                    type: eventName,
                    args: args,
                    target: this.component
                }, this.component, util.global);
            });
        }

        /**
         * 监控绑定表达式,表达式里任意数据更新时,同步到component的指定属性
         */
        private _initComponentWatcher(property: string, expression: string, isTwoWay: boolean) {
            var viewModel = this.viewModel;
            var component = this.component;
            var propInfo = this.properties[property] = { expression, isDynamic: true, value: undefined };
            var unwatch: () => void;

            if (isTwoWay) {
                let result = expression.match(reOneInterpolate);

                if (!result) {
                    throw new Error(`${expression}: 该表达式不能进行双向绑定`);
                }

                let ownerProperty = result[1].trim();

                unwatch = component.$watch(property, (newValue, oldValue) => {
                    let currValue = viewModel.$eval(expression, true);
                    if (newValue === currValue) {
                        return;
                    }
                    propInfo.value = newValue;
                    viewModel.$setValue(ownerProperty, newValue);
                });

                this.unwatches.push(unwatch);
            }

            unwatch = viewModel.$watch(expression, (newValue) => {
                if (component[property] === newValue) {
                    return;
                }
                propInfo.value = newValue;
                component[property] = newValue;
            }, false, true);

            this.unwatches.push(unwatch);
        }

        /**
         * 组件释放
         */
        release() {
            if (this._realizePromise) {
                this._realizePromise.cancel();
            }
            if (this.component) {
                this.component.$release();
            }
            if (this.unwatches) {
                // 移除所有的属性监控
                this.unwatches.forEach(unwatch => unwatch());
            }

            if (this._headNode && this._tailNode) {
                dom.remove(this._headNode);
                dom.remove(this._tailNode);

                Binding.removeWeakRef(this._headNode, this);
                Binding.removeWeakRef(this._tailNode, this);
            }

            // 移除所有引用
            this._headNode = this._tailNode = this.component = this.unwatches = this.properties = this.events = this._realizePromise = null;
            this.isDisposed = true;
        }
    }
}