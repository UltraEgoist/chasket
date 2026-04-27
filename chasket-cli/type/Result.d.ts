
/**
 * 結果オブジェクト
 * 成功時はOk(value)を返し、失敗時はErr(error)を返す。
 * @template T 成功時の値の型
 * @template E 失敗時のエラー情報の型
 */
type Result<T, E> = {
    /**
     * 成功時の値を返す
     * @param value
     * @returns {Result<T, E>}
     */
    static Ok(value: T): Result<T, E>;
    /**
     * 失敗時のエラー情報を返す
     * @param error
     * @returns {Result<T, E>}
     */
    static Err(error: E): Result<T, E>;


    /**
     * 新しい型を持つResultにラップし直すためのandThen
     * @template U 成功時Tの変換先
     */
    flatMap(fn: ((value: T) => Result<U, E>)): Result<U, E>;


    /**
     * 成功している場合の値を使用したmap
     * @template U 失敗時Eの変換先
     */
    map(fn: ((value: T) => U)): Result<U, E>;

    /**
     * 失敗時の値を使用したmap
     * @template F 失敗Eの変換先
     */
    mapError(fn: ((error: E) => F)): Result<T, F>;

    /**
     * @template R 成功か失敗を変換するための共通の型
     * 成功時と失敗時とでそれぞれ共通の型に変換する
     */
    fold(onOk: ((value: T) => R), onErr: ((error: E) => R)): R;

    /**
     * 成功したかの結果を返す\
     * #TODO: Resultへの完全移行が完了次第削除予定
     */
    isSuccess(): boolean;
};