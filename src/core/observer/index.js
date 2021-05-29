/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  // 初始化观测对象，依赖对象，实例计数器三个实例属性
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  // 构造函数接受被观测对象参数
  constructor (value: any) {
    this.value = value // 将传入的观测对象赋予实例的value属性
    this.dep = new Dep() // 创建新的Dep依赖对象实例赋予dep属性
    this.vmCount = 0 // 初始化实例的vmCount为0
    //def是定义的函数，使用Object.defineProperty()给value添加不可枚举的属性,__ob__是一个对象被observe的标志。
    // 我们在开发的过程中，有时会遇到，数据改变但视图没有更新的问题。
    // 这个时候，你可以log一下，看看该对象是否有__ob__属性来判断该对象是不是被observe了，如果没有，那么数据改变后视图是不可能更新的。
    def(value, '__ob__', this)
    // 如果是数组，调用observeArray()遍历数组，为数组内每个对象添加getter和setter
    if (Array.isArray(value)) {
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // observe每个数组元素(observe会生成Observer类)
      this.observeArray(value)
    } else {
      // 对于对象，遍历对象，并用Object.defineProperty转化为getter/setter，便于监控数据的get和set
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  // 遍历对象，调用defineReactive将每个属性转化为getter/setter
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  // observe每个数组元素(observe会生成Observer类)
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers
// 下面是两个辅助函数，用来根据是否可以使用对象的 __proto__属性来拦截原型
/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */

// observer实例的生成函数，如果数据没有被observe过，那么新建一个observer类并返回，否则直接返回observer类
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 判断是否为所要求的对象，否则不继续执行
  if (!isObject(value) || value instanceof VNode) { // 检测 value.prototype 是否存在于参数 VNode 的原型链上
    return
  }
  // 定义Observer类型或空值的ob变量
  let ob: Observer | void
  // 如果观测值具有__ob__属性，并且其值是Observer实例，将其赋予ob
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    // 如果shouldObserve为真，且不是服务器渲染，观测值是数组或者对象
    // 观测值可扩展，且观测值不是Vue实例，则创建新的观察目标实例赋予ob
    // 这里发现了在Vue核心类创建实例的时候设置的_isVue的用途了
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 如果数据没有被observe过，且数据是array或object类型，那么将数据转化为observer类型，所以observer类接收的是对象和数组
    ob = new Observer(value)
  }
  // 如果是RootData，即在新建Vue实例时，传到data里的值，只有RootData在每次observe的时候，会进行计数。
  // vmCount是用来记录此Vue实例被使用的次数的，比如在页面头部和尾部都需要引入了logo组件，都用了这个组件，那么这个时候vmCount就会计数，值为2
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
// defineReactive函数用来为观测值包装存取器
export function defineReactive (
  obj: Object, // 观测源
  key: string, // 属性
  val: any, // 值
  customSetter?: ?Function, // 自定义setter方法customSetter
  shallow?: boolean //是否进行递归转换
) {
  // 实例化一个Dep，这个Dep存在在下面的get和set函数的作用域中，用于收集订阅数据更新的Watcher。
  // 这里一个Dep与一个属性（即参数里的key）相对应，一个Dep可以有多个订阅者
  const dep = new Dep() // 创建依赖对象实例
  // 获取指定对象上一个自有属性对应的属性描述符。（自有属性指的是直接赋予该对象的属性，不需要从原型链上进行查找的属性）
  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 如果该属性不可配置则不继续执行
  if (property && property.configurable === false) { // 当且仅当该属性的 configurable 为 true 时，
    // 该属性描述符才能够被改变，同时该属性也能从对应的对象上被删除
    return
  }
  // 提供预定义的存取器函数
  const getter = property && property.get
  const setter = property && property.set
  // 如果不存在getter或存在settter，且函数只传入2个参数，手动设置val值
  // 这里主要是Obserber的walk方法里使用的情况，只传入两个参数
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 注意下面这行代码，设置getter/setter之前，会observe该属性对应的值（val）。
  // 比如此时参数传入的obj是{ objKey: { objValueKey1:{ objValueKey2: objValueValue2 } } },key是objKey，
  // val是{ objValueKey1:{ objValueKey2: objValueValue2 } }，
  // 那么这个时候{ objValueKey1:{ objValueKey2: objValueValue2 } }对象也会被observe到，在observe该对象的时候，{ objValueKey2: objValueValue2 }也会被observe到。
  // 以此类推，不管对象的结构有多深都会被observe到。
  let childOb = !shallow && observe(val) // 判断是否递归观察子对象，并将子对象属性都转换成存取器，返回子观察目标
  // 重新定义属性
  Object.defineProperty(obj, key, {
    enumerable: true, // 该属性能否出现在对象的枚举属性中
    configurable: true, // 对象的属性是否可以被删除，以及除value和writable特性外的其他特性是否可以被修改。
    // 设置getter，此处reactiveGetter是getter
    get: function reactiveGetter () {
      // 获取属性的值，如果这个属性在转化之前定义过getter，那么调用该getter得到value的值，否则直接返回val
      const value = getter ? getter.call(obj) : val
      // 这里是Dep收集订阅者的过程，只有在Dep.target存在的情况下才进行这个操作，在Watcher收集依赖的时候才会设置Dep.target，所以Watcher收集依赖的时机就是Dep收集订阅者的时机。
      // Watcher收集依赖,此时Dep收集订阅者
      if (Dep.target) { // 如果存在当前依赖目标，即监视器对象，则建立依赖
        // Dep收集订阅者
        dep.depend()
        //不仅这个属性需要添加到依赖列表中，如果这个属性对应的值是对象或数组，那么这个属性对应的值也需要添加到依赖列表中
        if (childOb) {
          childOb.dep.depend()
          // 如果是数组，那么特殊处理收集数组对象依赖
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      // 返回属性值
      return value
    },
    // 设置setter，接收新值newVal参数
    set: function reactiveSetter (newVal) {
      // 获取属性的值，如果这个属性在转化之前定义过getter，那么调用该getter得到value的值，否则直接返回val
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 如果新值等于旧值或者新值旧值为null则不执行
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      // 非生产环境下如果customSetter存在，则调用customSetter
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      // 如果预定义setter存在则调用，否则直接更新新值
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 判断是否递归观察子对象并返回子观察目标
      // 当为属性设置了新的值，是需要observe的
      childOb = !shallow && observe(newVal)
      //set的时候数据变化了，通知更新数据
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
// 下面是单独定义并导出的动态增减属性时观测的函数
// 设置对象的属性。添加新属性，如果该属性不存在，则触发更改通知。
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 对于数组的处理，调用变异方法splice，这个时候数组的Dep会发布更新消息
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  // 如果set的是对象已经有的属性，那么该属性已经有getter/setter函数了，此时直接修改即可
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  // 如果是对象没有的属性，则添加getter/setter
  defineReactive(ob.value, key, val)
  // 注意此处，对象的Dep会发布更新
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
   * Collect dependencies on array elements when the array is touched, since
   * we cannot intercept array element access like property getters.
 */
// 特殊处理数组的依赖收集的函数，递归的对数组中的成员执行依赖收集
// 在触及数组时收集对数组元素的依赖关系，因为我们不能像属性getter那样拦截数组元素访问。
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    // 在调用这个函数的时候，数组已经被observe过了，且会递归observe。(看上面defineReactive函数里的这行代码：let childOb = !shallow && observe(val))
    // 所以正常情况下都会存在__ob__属性，这个时候就可以调用dep添加依赖了。
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
