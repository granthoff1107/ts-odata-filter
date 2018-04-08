import {
  Type, ODataProperty, ODataPropertyPath,
  ODataTypes,
  IBasicDynamicFilterBuilder,
  IDynamicCollectionPropFilterBuilder,
  IDynamicFilterBuilderResult,
  IDynamicFilterExpressionResult,
  BasicDynamicBuilderFunc,
  BasicDynamicBuilderArg,
  BasicDynamicBuilderArgFunc,
  TDynamicPropType
} from './dynamic-types'


export class DynamicFilterExpressionResult
  implements IDynamicFilterExpressionResult {
  constructor(private stringResult: string) {}
  getString() {
    return this.stringResult
  }
}

export function buildWithBuilder<T, TBuilder extends BasicDynamicFilterBuilder>(
  builder: TBuilder,
  f: BasicDynamicBuilderFunc<TBuilder>
) {
  if (!f) {
    return new DynamicFilterExpressionResult('')
  }
  const result = f(builder, builder.prop)
  const str = builder.getArgString(result)
  return new DynamicFilterExpressionResult(str)
}

export class BasicDynamicFilterBuilder implements IBasicDynamicFilterBuilder {
  protected constructor(protected prefix: string | null = null) {}

  getArgString<
    TResult extends TDynamicPropType,
    TBuilder extends BasicDynamicFilterBuilder
  >(arg: BasicDynamicBuilderArg<TBuilder, TResult>): string {
    if (typeof arg === 'function') {
      const func = arg as BasicDynamicBuilderArgFunc<BasicDynamicFilterBuilder, TResult>
      arg = func(this, this.prop)
    }

    if(arg instanceof ODataPropertyPath)
    {
       return arg.path;
    }
    if (arg instanceof DynamicFilterExpressionResult) {
      return arg.getString()
    }
    if (arg instanceof Date) {
      return arg.toISOString()
    }
    if (typeof arg === 'string') {
      return `'${(arg as string).replace(/'/g, "''")}'`
    }
    return JSON.stringify(arg)
  }

  function<TResult extends TDynamicPropType, TBuilder extends BasicDynamicFilterBuilder>(
    functionName: string,
    ...args: BasicDynamicBuilderArg<TBuilder, TDynamicPropType>[]
  ) {
    const argsString = args.map(a => this.getArgString(a)).join(', ')
    return new DynamicFilterExpressionResult(
      `${functionName}(${argsString})`
    )
  }

  binaryOperator<
    TArg extends TDynamicPropType,
    TBuilder extends BasicDynamicFilterBuilder
  >(
    op: string,
    left: BasicDynamicBuilderArg<TBuilder, TArg>,
    right: BasicDynamicBuilderArg<TBuilder, TArg>
  ): DynamicFilterExpressionResult {
    const leftStr = this.getArgString(left)
    const rightStr = this.getArgString(right)
    return new DynamicFilterExpressionResult(
      `${leftStr} ${op} ${rightStr}`
    )
  }

  protected logicalOperator<
    TArg extends TDynamicPropType,
    TBuilder extends BasicDynamicFilterBuilder
  >(op: string, ...args: BasicDynamicBuilderArg<TBuilder, TArg>[]) {
    if (!args.length) {
      return new DynamicFilterExpressionResult(`true`)
    }
    const argsString = args.map(a => this.getArgString(a)).join(` ${op} `)
    return new DynamicFilterExpressionResult(`(${argsString})`)
  }

  get prop() : ODataPropertyPath {
    const prefix = this.prefix ? this.prefix : '';
    return new ODataPropertyPath(prefix);
  }

  protected collectionProp<TBuilder extends BasicDynamicFilterBuilder>(
    prop: any,
    varName: string | null
  ): IDynamicCollectionPropFilterBuilder<TBuilder> {
    const polymorphicCtor = this.constructor as any
    return new DynamicCollectionPropFilterBuilder(prop, polymorphicCtor, varName)
  }

  protected nestedCondition<TBuilder extends BasicDynamicFilterBuilder>(
    prop: ODataPropertyPath,
    condition: BasicDynamicBuilderArg<TBuilder, ODataTypes.Bool>
  ): DynamicFilterExpressionResult{
    const polymorphicCtor = this.constructor as any
    const prefix = prop.path
    const nestedBuilder: TBuilder = new polymorphicCtor(prefix)
    return new DynamicFilterExpressionResult(
      nestedBuilder.getArgString(condition)
    )
  }
}

class DynamicCollectionPropFilterBuilder<TBuilder extends BasicDynamicFilterBuilder>
  implements IDynamicCollectionPropFilterBuilder<TBuilder> {
  constructor(
    private collectionProp: ODataPropertyPath,
    private builderClass: Type<TBuilder>,
    private varName: string | null
  ) {}

  any(condition: BasicDynamicBuilderArgFunc<TBuilder, ODataTypes.Bool> | null = null) {
    return this.collectionFunc('any', condition)
  }

  all(condition: BasicDynamicBuilderArgFunc<TBuilder, ODataTypes.Bool>) {
    return this.collectionFunc('all', condition)
  }

  private collectionFunc(
    name: string,
    condition: BasicDynamicBuilderArgFunc<TBuilder, ODataTypes.Bool> | null
  ) {
    const prefix = this.collectionProp.path
    if (!condition) {
      return new DynamicFilterExpressionResult(`${prefix}/${name}()`)
    }

    const varName =
      this.varName ||
      'i' +
        Math.floor((1 + Math.random()) * 0x10000)
          .toString(16)
          .substring(1)
    const builder = new this.builderClass(varName)
    return new DynamicFilterExpressionResult(
      `${prefix}/${name}(${varName}: ${builder.getArgString(condition)})`
    )
  }

  get count() {
    const prefix = this.collectionProp;
    return new DynamicFilterExpressionResult(`${prefix}/$count`)
  }
}