import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import styles from './PortalSelect.module.css'

export interface PortalSelectOption {
  value: string
  label: string
  description?: string
}

interface PortalSelectProps {
  options: PortalSelectOption[]
  value: string
  ariaLabelledBy: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function PortalSelect({
  options,
  value,
  ariaLabelledBy,
  disabled = false,
  onChange,
}: PortalSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selectedIndex = Math.max(
    0,
    options.findIndex((item) => item.value === value),
  )
  const selected = options[selectedIndex]

  useEffect(() => {
    function closeWhenOutside(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', closeWhenOutside)
    return () => document.removeEventListener('mousedown', closeWhenOutside)
  }, [])

  function choose(nextValue: string): void {
    onChange(nextValue)
    setIsOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (disabled) return
    if (event.key === 'Escape') {
      setIsOpen(false)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setIsOpen((current) => !current)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const offset = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (selectedIndex + offset + options.length) % options.length
    choose(options[nextIndex]!.value)
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        className={styles.trigger}
        type="button"
        role="combobox"
        aria-labelledby={ariaLabelledBy}
        aria-controls={listId}
        aria-expanded={isOpen}
        disabled={disabled || options.length === 0}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span className={styles.value}>
          {selected?.label ?? 'Selecione um modelo'}
        </span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          className={styles.menu}
          id={listId}
          role="listbox"
          aria-labelledby={ariaLabelledBy}
        >
          {options.map((option) => (
            <button
              className={
                option.value === value ? styles.optionSelected : styles.option
              }
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => choose(option.value)}
            >
              <strong>{option.label}</strong>
              {option.description && <small>{option.description}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
