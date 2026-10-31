/** 17 种音质目录，与后端 SongFileType 一一对应（顺序即展示顺序）。 */
export interface Quality {
  code: string
  label: string
  /** 分组，用于列表分区着色 */
  group: 'hires' | 'lossless' | 'lossy'
}

export const QUALITIES: readonly Quality[] = [
  { code: 'DT03', label: 'DTS:X', group: 'hires' },
  { code: 'AI00', label: '臻品母带', group: 'hires' },
  { code: 'Q000', label: '臻品音质', group: 'hires' },
  { code: 'Q001', label: '臻品全景声 5.1', group: 'hires' },
  { code: 'Q003', label: '臻品全景声 7.1', group: 'hires' },
  { code: 'D004', label: '杜比全景声', group: 'hires' },
  { code: 'TL01', label: 'AICodec', group: 'hires' },
  { code: 'F000', label: 'SQ 无损', group: 'lossless' },
  { code: 'O801', label: 'OGG 640', group: 'lossless' },
  { code: 'O800', label: 'OGG 320', group: 'lossless' },
  { code: 'O600', label: 'OGG 192', group: 'lossy' },
  { code: 'O400', label: 'OGG 96', group: 'lossy' },
  { code: 'M800', label: 'MP3 320', group: 'lossy' },
  { code: 'M500', label: 'MP3 128', group: 'lossy' },
  { code: 'C600', label: 'AAC 192', group: 'lossy' },
  { code: 'C400', label: 'AAC 96', group: 'lossy' },
  { code: 'C200', label: 'AAC 48', group: 'lossy' },
]

export const QUALITY_TOTAL = QUALITIES.length
