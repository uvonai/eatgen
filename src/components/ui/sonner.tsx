import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      duration={6000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-xl group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-foreground group-[.toast]:text-background group-[.toast]:rounded-lg",
          cancelButton: "group-[.toast]:bg-foreground group-[.toast]:text-background group-[.toast]:rounded-lg",
          success: "group-[.toaster]:!bg-card group-[.toaster]:!text-foreground group-[.toaster]:!border-border",
          error: "group-[.toaster]:!bg-card group-[.toaster]:!text-foreground group-[.toaster]:!border-destructive/50",
          warning: "group-[.toaster]:!bg-card group-[.toaster]:!text-foreground group-[.toaster]:!border-border",
          info: "group-[.toaster]:!bg-card group-[.toaster]:!text-foreground group-[.toaster]:!border-border",
        },
      }}
      offset={8}
      {...props}
    />
  );
};

export { Toaster, toast };
