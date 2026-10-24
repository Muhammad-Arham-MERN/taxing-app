// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Toast as ToastPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"
import { dismissToast, useToasts } from "@/hooks/useToast"

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-xl border p-4 pr-8 shadow-lg transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-right-full data-[state=closed]:slide-out-to-right-full",
  {
    variants: {
      variant: {
        default: "border-border bg-popover text-popover-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-destructive",
        success:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/**
 * The shadcn/Radix toast host. Mounted once; every call to `toast(...)` renders
 * here instead of being painted inline beside the control that caused it.
 */
function Toaster() {
  const toasts = useToasts()

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          open={item.open}
          duration={item.duration}
          onOpenChange={(open) => {
            if (!open) {
              dismissToast(item.id)
            }
          }}
          className={cn(toastVariants({ variant: item.variant }))}
        >
          <div className="grid gap-1">
            {item.title ? (
              <ToastPrimitive.Title className="text-sm font-medium">
                {item.title}
              </ToastPrimitive.Title>
            ) : null}
            {item.description ? (
              <ToastPrimitive.Description className="text-xs leading-snug opacity-90">
                {item.description}
              </ToastPrimitive.Description>
            ) : null}
          </div>
          <ToastPrimitive.Close
            className="absolute top-2 right-2 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <XIcon className="size-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-[100] m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none" />
    </ToastPrimitive.Provider>
  )
}

export type ToastVariantProps = VariantProps<typeof toastVariants>
export { Toaster, toastVariants }
// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
