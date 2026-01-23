"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CornerDownLeftIcon, Loader2Icon, SquareIcon } from "lucide-react";
import {
  type ChangeEvent,
  type ComponentProps,
  type FormEvent,
  type FormEventHandler,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type PropsWithChildren,
  useRef,
  useState,
} from "react";

export interface PromptInputMessage {
  text: string;
}

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit" | "onError"
> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => void | Promise<void>;
  isLoading?: boolean;
  onStop?: () => void;
};

export const PromptInput = ({
  className,
  onSubmit,
  isLoading,
  onStop,
  children,
  ...props
}: PromptInputProps) => {
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = (formData.get("message") as string) || "";

    if (!text.trim()) return;

    const result = onSubmit({ text }, event);

    if (result instanceof Promise) {
      result.then(() => {
        form.reset();
      });
    } else {
      form.reset();
    }
  };

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={handleSubmit}
      ref={formRef}
      {...props}
    >
      <div className="flex flex-col gap-2 rounded-lg border bg-background p-2">
        {children}
      </div>
    </form>
  );
};

export type PromptInputTextareaProps = HTMLAttributes<HTMLTextAreaElement> & {
  placeholder?: string;
  onValueChange?: (value: string) => void;
  value?: string;
};

export const PromptInputTextarea = ({
  onChange,
  onKeyDown,
  className,
  placeholder = "What would you like to know?",
  onValueChange,
  value,
  ...props
}: PromptInputTextareaProps) => {
  const [isComposing, setIsComposing] = useState(false);
  const [localValue, setLocalValue] = useState("");

  const currentValue = value !== undefined ? value : localValue;

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    onKeyDown?.(e as any);

    if (e.defaultPrevented) return;

    if (e.key === "Enter") {
      if (isComposing || e.nativeEvent.isComposing) return;
      if (e.shiftKey) return;

      e.preventDefault();
      const form = e.currentTarget.form;
      form?.requestSubmit();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (value === undefined) {
      setLocalValue(newValue);
    }
    onValueChange?.(newValue);
    onChange?.(e as any);
  };

  return (
    <textarea
      className={cn(
        "min-h-[60px] max-h-48 w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none",
        className
      )}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      placeholder={placeholder}
      value={currentValue}
      rows={1}
      {...props}
    />
  );
};

export type PromptInputFooterProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement>
>;

export const PromptInputFooter = ({
  className,
  ...props
}: PromptInputFooterProps) => (
  <div
    className={cn("flex items-center justify-between gap-2", className)}
    {...props}
  />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({
  className,
  ...props
}: PromptInputToolsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props} />
);

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  isLoading?: boolean;
  onStop?: () => void;
};

export const PromptInputSubmit = ({
  className,
  variant = "secondary",
  size = "sm",
  isLoading,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) => {
  let Icon = <CornerDownLeftIcon className="size-4" />;

  if (isLoading) {
    Icon = onStop ? (
      <SquareIcon className="size-4" />
    ) : (
      <Loader2Icon className="size-4 animate-spin" />
    );
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isLoading && onStop) {
      e.preventDefault();
      onStop();
      return;
    }
    onClick?.(e);
  };

  return (
    <Button
      aria-label={isLoading ? "Stop" : "Submit"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isLoading && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </Button>
  );
};
