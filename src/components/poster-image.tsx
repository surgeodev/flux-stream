import { useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PosterImageProps {
  src: string
  alt?: string
  className?: string
  imgClassName?: string
  placeholder?: string
}

export function PosterImage({ src, alt = '', className, imgClassName, placeholder }: PosterImageProps) {
  const [failed, setFailed] = useState(false)
  const empty = !src || failed

  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-card via-muted/60 to-muted', className)}>
      {!empty ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn('w-full h-full object-cover', imgClassName)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
          <Clapperboard className="w-6 h-6 md:w-7 md:h-7 text-primary/50" strokeWidth={1.5} />
          {placeholder && (
            <span className="text-xs md:text-sm font-bold text-white/40 text-center leading-tight line-clamp-2">
              {placeholder}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
