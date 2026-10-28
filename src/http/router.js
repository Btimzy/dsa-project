// Lightweight URL router supporting standard HTTP methods and :param path segments.

export class Router {
  #routes = [];

  add(method, pathPattern, handler) {
    if (typeof method !== 'string' || typeof pathPattern !== 'string' || typeof handler !== 'function') {
      throw new TypeError('Invalid route definition: method, pathPattern, and handler are required');
    }
    const cleanPattern = pathPattern.replace(/\/+$/, '') || '/';
    const segments = cleanPattern.split('/').filter(Boolean);
    this.#routes.push({
      method: method.toUpperCase(),
      pathPattern: cleanPattern,
      segments,
      handler,
    });
  }

  get(path, handler) {
    this.add('GET', path, handler);
  }

  post(path, handler) {
    this.add('POST', path, handler);
  }

  put(path, handler) {
    this.add('PUT', path, handler);
  }

  delete(path, handler) {
    this.add('DELETE', path, handler);
  }

  patch(path, handler) {
    this.add('PATCH', path, handler);
  }

  match(method, pathname) {
    const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
    const reqSegments = cleanPath.split('/').filter(Boolean);
    const reqMethod = (method || '').toUpperCase();

    for (const route of this.#routes) {
      if (route.method !== reqMethod) {
        continue;
      }
      if (route.segments.length !== reqSegments.length) {
        continue;
      }

      const params = {};
      let isMatch = true;

      for (let i = 0; i < route.segments.length; i += 1) {
        const routeSeg = route.segments[i];
        const reqSeg = reqSegments[i];

        if (routeSeg.startsWith(':')) {
          const paramName = routeSeg.slice(1);
          try {
            params[paramName] = decodeURIComponent(reqSeg);
          } catch {
            params[paramName] = reqSeg;
          }
        } else if (routeSeg !== reqSeg) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        return {
          handler: route.handler,
          params,
        };
      }
    }

    return null;
  }
}

export function createRouter() {
  return new Router();
}
