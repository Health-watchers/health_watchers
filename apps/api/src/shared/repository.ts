export interface Repository<T, Id = string> {
  findById(id: Id): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: Id): Promise<void>;
}
