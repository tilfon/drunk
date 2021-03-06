﻿///<reference path="../../build/drunk.d.ts" />

namespace drunk {

    import config = drunk.config;
    import Component = drunk.Component;
    import Promise = drunk.Promise;

    interface IRouter {
        routeReg: RegExp;
        routeStr: string;
        paramArr: string[];
        viewId: string;
    }

    export interface IRouterState {
        url: string;
        route: string;
        params: { [name: string]: any };
        viewId: string;
    }

    export interface IRouterComponent extends drunk.IComponentOptions {
        onEnter?(state: IRouterState, navigationState?: Object);
        onExit?();
    }

    export interface IApplication {
        start(rootElement?: HTMLElement, url?: string): void;
        navigate(url: string, replaceState?: boolean, state?: any): void;
        back(): void;
    }

    export class RouterComponent extends Component implements IApplication {

        private _rootUrl: string;
        private _routeList: IRouter[] = [];
        private _currView: IRouterComponent;
        private _currViewId: string;
        private _routeState: IRouterState;
        private _navigationState: any;
        private _visibleViews: IModel = {};

        /**
         * 启动
         * @param  rootElement  默认以document.body启动
         * @param  url          启动的路由
         */
        start(rootElement = document.body, url = location.hash.slice(1)) {
            this._parse(rootElement);
            this._initNavigationEvent();

            this.$mount(util.toArray(rootElement.childNodes));
            this._navigate(url);
        }

        /**
         * 导航到指定url
         * @param  url           url参数
         * @param  replaceState  是否替换掉当前的页面历史纪录
         * @param  state         传递的参数
         */
        navigate(url: string, replaceState?: boolean, state?: any) {
            this._navigationState = state;
            if (replaceState) {
                location.replace(url);
            }
            else {
                location.href = url;
            }
        }

        /**
         * 后退
         */
        back() {
            history.back();
        }

        private _viewCreated(view: IRouterComponent) {
            this._currView = view;

            if (typeof view.onEnter === 'function') {
                view.onEnter(this._routeState, this._navigationState);
            }
        }

        private _viewRelease(view: IRouterComponent) {
            if (typeof view.onExit === 'function') {
                view.onExit();
            }
        }

        private _viewMounted(view: IRouterComponent) {
            // this._isNavigating = false;
        }

        private _templateLoadFailed(view: IRouterComponent) {
            this.$emit(Component.Event.templateLoadFailed, view);
        }

        private _parse(rootElement: HTMLElement) {
            var nameOfRoute = config.prefix + 'route';
            var nameOfIndex = config.prefix + 'index';
            var nameOfIfBinding = config.prefix + 'if';
            var nameOfEventBinding = config.prefix + 'on';
            var eventExpression = `
                ${Component.Event.created}:_viewCreated($el);
                ${Component.Event.mounted}:_viewMounted($el);
                ${Component.Event.release}:_viewRelease($el);
                ${Component.Event.templateLoadFailed}:_templateLoadFailed($el)`;
            var route: string;
            var name: string;

            var scan = (element: HTMLElement) => {
                // 检查所有的child元素节点
                util.toArray(element.children).forEach(node => {
                    name = node.tagName.toLowerCase();

                    if (name.indexOf('-') === -1 || !node.hasAttribute(nameOfRoute)) {
                        // 如果没有指定路由或不是一个自定义组件标签
                        if (node.children) {
                            scan(node);
                        }
                        return;
                    }

                    if (node.hasAttribute(nameOfIfBinding)) {
                        return console.error(`设置了路由的组件标签上请勿再使用'${nameOfIfBinding}'绑定指令`, node);
                    }

                    route = node.getAttribute(nameOfRoute); // 路由表
                    node.removeAttribute(nameOfRoute); // 移除属性

                    // 添加一个if绑定,通过改实例的_visibleViews数据来监控和注册组件创建/销毁的事件,
                    // 用于当理由切换时改变显示的组件和得到相应的组件实例
                    // 会生成类似这样: <my-component drunk-if='_visibleViews.myComponent' drunk-on="..."></my-component>
                    node.setAttribute(nameOfIfBinding, '_visibleViews["' + name + '"]');
                    node.setAttribute(nameOfEventBinding, eventExpression);

                    // 添加并解析路由,设置改组件默认不可见
                    this._addRoute(route, name);
                    this._visibleViews[name] = false;
                    // this._isNavigating = true;
                });
            };

            scan(rootElement);

            // 查找drunk-index路径
            this._rootUrl = rootElement.getAttribute(nameOfIndex);

            if (!this._rootUrl) {
                console.error(rootElement, `节点上未找到${nameOfIndex}设置`);
            }
            rootElement.removeAttribute(nameOfIndex);
        }

        private _addRoute(route: string, viewId: string) {
            var routeReg = pathToRegexp(route);
            var paramArr = routeReg.keys.map(key => key.name);

            delete routeReg.keys;

            this._routeList.push({
                routeReg: routeReg,
                routeStr: route,
                paramArr: paramArr,
                viewId: viewId
            });
        }

        private _initNavigationEvent() {
            window.addEventListener("hashchange", () => {
                this._navigate(location.hash.slice(1));
            });
        }

        private _navigate(url: string) {
            var state: IRouterState;

            if (!url || !(state = this._parseUrl(url))) {
                return this.navigate('#' + this._rootUrl, true);
            }

            this._routeState = state;

            if (this._currView) {
                // 如果存在当前组件
                if (this._currViewId === state.viewId) {
                    // 判断是否是在同一组件中导航,如果是,直接调用该组件的onEnter方法
                    this._viewCreated(this._currView);
                }
                else {
                    // 设置当前组件隐藏
                    this._visibleViews[this._currViewId] = false;
                }
            }

            // 设置导航到的组件显示
            this._visibleViews[state.viewId] = true;
            this._currViewId = state.viewId;
        }

        private _parseUrl(url: string): IRouterState {
            var saveParam = (param, j) => {
                params[param] = result[j + 1];
            };
            var result: RegExpExecArray;
            var params: { [name: string]: any };

            for (let router: IRouter, i = 0, routeReg: RegExp, routeStr: string, paramArr; router = this._routeList[i]; i++) {
                routeReg = router.routeReg;
                routeStr = router.routeStr;
                paramArr = router.paramArr;

                if (routeReg.test(url)) {
                    result = routeReg.exec(url);
                    params = {};
                    paramArr.forEach(saveParam);
                    return {
                        url: url,
                        route: routeStr,
                        params: params,
                        viewId: router.viewId
                    };
                }
            }
        }
    }

    /**
     * The main path matching regexp utility.
     *
     * @type {RegExp}
     */
    var PATH_REGEXP = new RegExp([
        // Match already escaped characters that would otherwise incorrectly appear
        // in future matches. This allows the user to escape special characters that
        // shouldn't be transformed.
        '(\\\\.)',
        // Match Express-style parameters and un-named parameters with a prefix
        // and optional suffixes. Matches appear as:
        //
        // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?"]
        // "/route(\\d+)" => [undefined, undefined, undefined, "\d+", undefined]
        '([\\/.])?(?:\\:(\\w+)(?:\\(((?:\\\\.|[^)])*)\\))?|\\(((?:\\\\.|[^)])*)\\))([+*?])?',
        // Match regexp special characters that should always be escaped.
        '([.+*?=^!:${}()[\\]|\\/])'
    ].join('|'), 'g');

    /**
     * Escape the capturing group by escaping special characters and meaning.
     *
     * @param  {String} group
     * @return {String}
     */
    function escapeGroup(group) {
        return group.replace(/([=!:$\/()])/g, '\\$1');
    }

    /**
     * Attach the keys as a property of the regexp.
     *
     * @param  {RegExp} re
     * @param  {Array}  keys
     * @return {RegExp}
     */
    var attachKeys = function (re, keys) {
        re.keys = keys;

        return re;
    };

    /**
     * Normalize the given path string, returning a regular expression.
     *
     * An empty array should be passed in, which will contain the placeholder key
     * names. For example `/user/:id` will then contain `["id"]`.
     *
     * @param  {(String|RegExp|Array)} path
     * @param  {Array}                 keys
     * @param  {Object}                options
     * @return {RegExp}
     */
    function pathToRegexp(path, keys?, options?) {
        if (keys && !Array.isArray(keys)) {
            options = keys;
            keys = null;
        }

        keys = keys || [];
        options = options || {};

        var strict = options.strict;
        var end = options.end !== false;
        var flags = options.sensitive ? '' : 'i';
        var index = 0;

        if (path instanceof RegExp) {
            // Match all capturing groups of a regexp.
            var groups = path.source.match(/\((?!\?)/g) || [];

            // Map all the matches to their numeric keys and push into the keys.
            keys.push.apply(keys, groups.map(function (match, index) {
                return {
                    name: index,
                    delimiter: null,
                    optional: false,
                    repeat: false
                };
            }));

            // Return the source back to the user.
            return attachKeys(path, keys);
        }

        if (Array.isArray(path)) {
            // Map array parts into regexps and return their source. We also pass
            // the same keys and options instance into every generation to get
            // consistent matching groups before we join the sources together.
            path = path.map(function (value) {
                return pathToRegexp(value, keys, options).source;
            });

            // Generate a new regexp instance by joining all the parts together.
            return attachKeys(new RegExp('(?:' + path.join('|') + ')', flags), keys);
        }

        // Alter the path string into a usable regexp.
        path = path.replace(PATH_REGEXP, function (match, escaped, prefix, key, capture, group, suffix, escape) {
            // Avoiding re-escaping escaped characters.
            if (escaped) {
                return escaped;
            }

            // Escape regexp special characters.
            if (escape) {
                return '\\' + escape;
            }

            var repeat = suffix === '+' || suffix === '*';
            var optional = suffix === '?' || suffix === '*';

            keys.push({
                name: key || index++,
                delimiter: prefix || '/',
                optional: optional,
                repeat: repeat
            });

            // Escape the prefix character.
            prefix = prefix ? '\\' + prefix : '';

            // Match using the custom capturing group, or fallback to capturing
            // everything up to the next slash (or next period if the param was
            // prefixed with a period).
            capture = escapeGroup(capture || group || '[^' + (prefix || '\\/') + ']+?');

            // Allow parameters to be repeated more than once.
            if (repeat) {
                capture = capture + '(?:' + prefix + capture + ')*';
            }

            // Allow a parameter to be optional.
            if (optional) {
                return '(?:' + prefix + '(' + capture + '))?';
            }

            // Basic parameter support.
            return prefix + '(' + capture + ')';
        });

        // Check whether the path ends in a slash as it alters some match behaviour.
        var endsWithSlash = path[path.length - 1] === '/';

        // In non-strict mode we allow an optional trailing slash in the match. If
        // the path to match already ended with a slash, we need to remove it for
        // consistency. The slash is only valid at the very end of a path match, not
        // anywhere in the middle. This is important for non-ending mode, otherwise
        // "/test/" will match "/test//route".
        if (!strict) {
            path = (endsWithSlash ? path.slice(0, -2) : path) + '(?:\\/(?=$))?';
        }

        // In non-ending mode, we need prompt the capturing groups to match as much
        // as possible by using a positive lookahead for the end or next path segment.
        if (!end) {
            path += strict && endsWithSlash ? '' : '(?=\\/|$)';
        }

        return attachKeys(new RegExp('^' + path + (end ? '$' : ''), flags), keys);
    };

    export var Application: IApplication = new RouterComponent();

}