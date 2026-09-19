/* Minimal user-interaction helpers built on fireEvent. `@testing-library/user-event`
   is not a dependency of this package, and adding one would touch the lockfile. */
import { fireEvent } from "@testing-library/react";

type Field = HTMLInputElement | HTMLTextAreaElement;

const userEvent = {
  async click(el: Element) {
    fireEvent.click(el);
  },
  /** Appends `text` to the field's current value (one change event). */
  async type(el: Element, text: string) {
    const field = el as Field;
    fireEvent.change(field, { target: { value: field.value + text } });
  },
  async clear(el: Element) {
    fireEvent.change(el as Field, { target: { value: "" } });
  },
  async upload(input: Element, file: File) {
    fireEvent.change(input, { target: { files: [file] } });
  },
};

export default userEvent;
