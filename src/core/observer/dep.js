/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'
let uid = 0 // 全局变量，每个实例中的dep实例的id都是从0开始累加的
// dep是个可观察对象，可以有多个指令订阅它
export default class Dep {
  static target: ?Watcher; // 私有变量，当前评估watcher对象
  id: number; // Dep实例的id
  subs: Array<Watcher>; // subscribe的简写，dep实例监视器/订阅者数组，存放订阅者
  constructor () {
    this.id = uid++ // 初始化时赋予递增的id
    this.subs = [] 
  }
  // 添加一个订阅者，接受Watcher类型的sub参数
  addSub (sub: Watcher) {
    this.subs.push(sub) // 向subs数组里添加新的watcher
  }
  // 删除一个订阅者
  removeSub (sub: Watcher) {
    remove(this.subs, sub) // 从subs数组里移除指定watcher
  }
  // Dep.target是一个Watcher, 在创建Wacther的时候会将在创建的Watcher赋值给Dep.target。
  // 这个方法做的事情是：让Watcher收集依赖，然后调用了Dep的addSub方法，给Dep添加了一个订阅者
  depend () {
    if (Dep.target) { // 建立依赖时如果存在Watcher，则会调用Watcher的addDep方法
      Dep.target.addDep(this)
    }
  }
  // 发布数据更新：通过调用subs里面的每个Watcher的update发布更新
  notify () {
    const subs = this.subs.slice() // 先稳定订subscriber列表
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // 如果不运行async，子命令就不会在调度程序中排序。我们现在需要对它们进行排序，以确保它们按正确的顺序触发。
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}


// Dep.target用来存放目前正在评估的watcher
// 全局唯一，并且一次也只能有一个watcher被评估
Dep.target = null
// targetStack用来存放watcher栈
const targetStack = []

// Vue2 中，视图被抽象为一个 render 函数，一个 render 函数只会生成一个 watcher。
// 比如我们有一个模板，模板中使用了Header组件。
// Vue2 中组件数的结构在视图渲染时就映射为 render 函数的嵌套调用，有嵌套调用就会有调用栈。
// 当 render模板时，遇到Header组件会调用Header组件的render函数，两个render函数依次入栈，执行完函数，依次出栈。
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
