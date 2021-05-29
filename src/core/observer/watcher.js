/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

// watcher用来解析表达式，收集依赖对象，并在表达式的值变动时执行回调函数
// 全局的$watch()方法和指令都以同样方式实现
export default class Watcher {
  // 定义变量
  vm: Component; // 实例
  expression: string; // 表达式
  cb: Function; // 回调函数
  id: number; // watcher实例Id
  deep: boolean; // 是否深层依赖
  user: boolean; // 是否用户定义
  lazy: boolean; // 是否计算属性
  sync: boolean; // 是否同步
  dirty: boolean; // 是否为脏监视器
  active: boolean; // 是否激活中
  deps: Array<Dep>; // 依赖对象数组
  newDeps: Array<Dep>; // 新依赖对象数组
  depIds: SimpleSet; // 依赖id集合
  newDepIds: SimpleSet; // 新依赖id集合
  before: ?Function; // 先行调用函数
  getter: Function; // 指定getter
  value: any; // 观察值

  constructor (
    vm: Component, // vue实例
    expOrFn: string | Function, // 表达式对象
    cb: Function, // 回调函数
    options?: ?Object, // 配置对象
    isRenderWatcher?: boolean // 是否渲染监视器
  ) {
    // 实例属性的赋值
    this.vm = vm
    // 如果是渲染监视器则将它赋值给实例的_watcher属性
    if (isRenderWatcher) {
      vm._watcher = this
    }
    // 添加到vm._watchers数组中
    vm._watchers.push(this)
    // 如果配置对象存在，初始化一些配置属性
    if (options) {
      // 对应$watch参数的deep，为了发现对象内部值的变化，可以在选项参数中指定 deep: true 
      this.deep = !!options.deep
      this.user = !!options.user
      // 跟computed相关
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      // 将配属性设为false
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    // 设置监视器的getter方法
    // 这里的getter会有两种情况：
    //  一、一个函数，比如在生命周期mount的时候，需要watch模板中的值，这个时候传过来的是一个函数，
    // 后面在get函数里调用时这个函数时，这个函数会调用数据的getter函数。
    //  二、一个表达式，比如我们在Vue实例的watch中写的表达式，后面在get函数里获取表达式的值的时候会调用数据的getter函数。
    //  expOrFn参数是一个字符串，比如testObj.testObjFirstVal，此时testObj仅仅是一个字符串，而不是对象，我们无法直接获取testObjFirstVal属性的值。
    //  所以我们在获取值得时候不能直接拿到值，parsePath函数就是用来解决这个问题的，这个函数具体的操作，在后面的代码里。
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn // 如果是渲染watcher，这个expOrFn 是updateComponent方法，在后面的get()方法中通过this.getter.call(vm, vm)来调用updateComponent方法，然后执行vm._update(vm._render, hydrating)完成渲染工作
    } else {
      // 解析传入的表达式的路径，返回最后一级数据对象
      // 这里是支持使用点符号获取属性的表达式来获取嵌套需观测数据
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 在非computed调用Watch函数时，都会调用get函数（computed有自己的逻辑）
    this.value = this.lazy
      ? undefined
      : this.get() // 调用get方法获取观测值
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  // get函数,评估getter，用来收集依赖和获取数据的值
  get () {
    // 将watcher添加到watcher栈中，将当前 watcher 设置为 Dep.target
    pushTarget(this)
    let value
    const vm = this.vm
    // 尝试调用vm的getter方法
    try {
      // 收集依赖
      value = this.getter.call(vm, vm) // 调用getter时这个函数时，getter会调用数据的getter函数
    } catch (e) {
      // 捕捉到错误时，如果是用户定义的watcher则处理异常
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 最终执行“触摸”每个属性的操作，以便将它们全部跟踪为深度监视的依赖关系
      if (this.deep) {
        // traverse方法递归每一个对象，将对象的每级属性收集为深度依赖项
        traverse(value)
      }
      // 执行出栈
      popTarget()
      // 将新收集的依赖newDeps赋值给deps，并将newDeps清空，准备在下一次数据更新时收集依赖
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 添加一个依赖
  addDep (dep: Dep) { // 接收Dep类型依赖实例对象
    const id = dep.id
    // 如果不存在依赖，将新依赖对象id和对象添加进相应数组中
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // 这里做了一个去重，如果depIds里包含这个id，说明在之前给depIds添加这个id的时候，已经调用过 dep.addSub(this)，即添加过订阅，不需要重复添加。
      if (!this.depIds.has(id)) {
        dep.addSub(this) // 在dep对象中添加监视器自身
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // 清理依赖项集合
  cleanupDeps () {
    let i = this.deps.length
    // 遍历依赖列表，去除多余的订阅者
    while (i--) {
      const dep = this.deps[i]
      // 如果Watcher不依赖于某个数据，即某个Dep,那么不需要再订阅这个数据的消息
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 重置监视器的依赖相关属性，
    // 将新建立的依赖转换成常规依赖
    // 并清空新依赖列表
    let tmp = this.depIds
    // 更新depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    // 清空newDepIds
    this.newDepIds.clear()
    tmp = this.deps
    // 更新deps
    this.deps = this.newDeps
    this.newDeps = tmp
    // 清空newDeps
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 当依赖项更改时将调用订阅服务器接口
  // 更新模板或表达式：调用run方法
  update () {
    /* istanbul ignore else */
    // 计算属性的观察有两种模式：懒模式和立即模式
    // 默认都设置为懒模式，要使用立即模式需要至少有一个订阅者，
    // 典型情况下是另一个计算属性或渲染函数
    if (this.lazy) {
      // 设置dirty属性为true，这是因为在懒模式下只在需要的时候才执行计算，所以为了稍后执行先把dirty属性设置成true,这样在属性被访问的时候才会执行真实的计算过程。
      this.dirty = true
    } else if (this.sync) {
      // 如果同步执行，则调用实例run方法
      this.run()
    } else {
      // 否则将监视器添加进待评估队列
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  // 调度程序将调用调度程序作业接口
  // 注意这里调用了get方法，会更新模板，且重新收集依赖
  run () {
    // 如果当前监视器处于活跃状态
    if (this.active) {
      // 获取新观测值
      // 对于渲染函数的观察者来讲，重新求值其实等价于重新执行渲染函数，最终结果就是重新生成了虚拟DOM并更新真实DOM，这样就完成了重新渲染的过程;因为 this.get 方法的返回值其实就等价于 updateComponent 函数的返回值，这个值将永远都是 undefined，所以并不会执行下面 if 语句块
      const value = this.get()
      // 当旧值与新值不相等，或者新值是对象，或需要深度观察时,触发变更，发布通知
      if (
        value !== this.value ||
        // 因为对象或数组即使相等时，其值可能发生变异所以也需要触发更新
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        // 如果是用户自定义监视器，则在调用回调函数时设置错误捕捉
        // 注意下面 this.cb.call，调用回调函数来更新模板或表达式的值（$watch表达式的时候，会更新表达式的值）
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  // 计算观察程序的值这只对懒惰的观察程序调用
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  // 建立监视器的依赖方法，提供给computed使用
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  // 从所有依赖项的订阅服务器列表中删除self
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
