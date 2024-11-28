export class TimestampValueConverter {
  toView(value: string) {
    return new Date(value).toLocaleString();
  }
}
