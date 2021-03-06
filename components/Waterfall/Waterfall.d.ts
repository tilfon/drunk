/// <reference path="../../build/drunk.d.ts" />
/**
 * 1. drunk-waterfall       添加在会触发滚动的容器上
 * 2. drunk-waterfall-item  添加在drunk-repeat的元素上
 * 3. waterfall-item-span   表示每个item间的垂直间隙
 *
 * example:
 *
 * <div class='container' drunk-waterfall:001="{onScroll: scrollHandler, onScrollEnd: scrollEndHandler, itemSpan: 10}">
 *      <div class="scroller">
 *          <div drunk-repeat="img in imgList" class="item" drunk-waterfall-item:001>
 *              <img >
 *          </div>
 *      </div>
 * </div>
 */
declare namespace drunk {
}
