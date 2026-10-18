// FIFO Queue implemented as a singly-linked list.
// All operations (enqueue, dequeue, peek, size) run in O(1) time without array.shift().

class QueueNode {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

export class Queue {
  #head = null;
  #tail = null;
  #size = 0;

  enqueue(value) {
    const node = new QueueNode(value);
    if (this.#tail === null) {
      this.#head = node;
      this.#tail = node;
    } else {
      this.#tail.next = node;
      this.#tail = node;
    }
    this.#size += 1;
  }

  dequeue() {
    if (this.#head === null) {
      return undefined;
    }
    const value = this.#head.value;
    this.#head = this.#head.next;
    if (this.#head === null) {
      this.#tail = null;
    }
    this.#size -= 1;
    return value;
  }

  peek() {
    return this.#head === null ? undefined : this.#head.value;
  }

  get size() {
    return this.#size;
  }

  get isEmpty() {
    return this.#size === 0;
  }

  *[Symbol.iterator]() {
    let current = this.#head;
    while (current !== null) {
      yield current.value;
      current = current.next;
    }
  }
}
