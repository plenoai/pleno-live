export class LifecycleFence {
  private generation = 0;
  private closed = false;

  capture(): number {
    return this.generation;
  }

  isActive(generation: number): boolean {
    return !this.closed && generation === this.generation;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.generation += 1;
  }
}
