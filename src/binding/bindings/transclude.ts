/// <reference path="../binding.ts" />
/// <reference path="../../component/component.ts" />
/// <reference path="../../util/dom.ts" />
/// <reference path="../../template/compiler.ts" />

namespace drunk {
    
    import Component = drunk.Component;
    import Template = drunk.Template;
    import util = drunk.util;
    import dom = drunk.dom;

    @binding("transclude")
    class TranscludeBinding extends Binding {
        
        private _nodes: Node[];
        private _unbinds: Function[];

        /**
         * 初始化绑定,先注册transcludeResponse事件用于获取transclude的viewModel和nodelist
         * 然后发送getTranscludeContext事件通知
         */
        init(ownerViewModel: Component, placeholder: HTMLElement) {
            if (!ownerViewModel || !placeholder) {
                throw new Error(`未提供父级component实例和组件声明的占位标签`);
            }

            let nodes = [];
            let unbinds = [];
            let transclude = placeholder.childNodes;
            let fragment = document.createDocumentFragment();

            util.toArray(transclude).forEach((node) => {
                nodes.push(node);
                fragment.appendChild(node);
            });

            // 换掉节点
            dom.replace(fragment, this.element);

            nodes.forEach((node) => {
                // 编译模板并获取绑定创建函数
                // 保存解绑函数
                let bind = Template.compile(node);
                unbinds.push(bind(ownerViewModel, node));
            });

            this._nodes = nodes;
            this._unbinds = unbinds;
        }

        /**
         * 释放绑定
         */
        release() {
            this._unbinds.forEach(unbind => unbind());
            this._nodes.forEach(node => dom.remove(node));
            this._unbinds = null;
            this._nodes = null;
        }
    }
}

