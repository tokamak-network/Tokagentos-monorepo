import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/service_interfaces.proto.
 */
export declare const file_tokagent_v1_service_interfaces: GenFile;
/**
 * @generated from message tokagent.v1.TokenBalance
 */
export type TokenBalance = Message<"tokagent.v1.TokenBalance"> & {
    /**
     * @generated from field: string address = 1;
     */
    address: string;
    /**
     * @generated from field: string balance = 2;
     */
    balance: string;
    /**
     * @generated from field: int32 decimals = 3;
     */
    decimals: number;
    /**
     * @generated from field: optional double ui_amount = 4;
     */
    uiAmount?: number;
    /**
     * @generated from field: optional string name = 5;
     */
    name?: string;
    /**
     * @generated from field: optional string symbol = 6;
     */
    symbol?: string;
    /**
     * @generated from field: optional string logo_uri = 7;
     */
    logoUri?: string;
};
/**
 * Describes the message tokagent.v1.TokenBalance.
 * Use `create(TokenBalanceSchema)` to create a new message.
 */
export declare const TokenBalanceSchema: GenMessage<TokenBalance>;
/**
 * @generated from message tokagent.v1.TokenData
 */
export type TokenData = Message<"tokagent.v1.TokenData"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string symbol = 2;
     */
    symbol: string;
    /**
     * @generated from field: string name = 3;
     */
    name: string;
    /**
     * @generated from field: string address = 4;
     */
    address: string;
    /**
     * @generated from field: string chain = 5;
     */
    chain: string;
    /**
     * @generated from field: string source_provider = 6;
     */
    sourceProvider: string;
    /**
     * @generated from field: optional double price = 7;
     */
    price?: number;
    /**
     * @generated from field: optional double price_change_24h_percent = 8;
     */
    priceChange24hPercent?: number;
    /**
     * @generated from field: optional double price_change_24h_usd = 9;
     */
    priceChange24hUsd?: number;
    /**
     * @generated from field: optional double volume_24h_usd = 10;
     */
    volume24hUsd?: number;
    /**
     * @generated from field: optional double market_cap_usd = 11;
     */
    marketCapUsd?: number;
    /**
     * @generated from field: optional double liquidity = 12;
     */
    liquidity?: number;
    /**
     * @generated from field: optional double holders = 13;
     */
    holders?: number;
    /**
     * @generated from field: optional string logo_uri = 14;
     */
    logoUri?: string;
    /**
     * @generated from field: optional int32 decimals = 15;
     */
    decimals?: number;
    /**
     * @generated from field: optional google.protobuf.Timestamp last_updated_at = 16;
     */
    lastUpdatedAt?: Timestamp;
    /**
     * @generated from field: google.protobuf.Struct raw = 17;
     */
    raw?: JsonObject;
};
/**
 * Describes the message tokagent.v1.TokenData.
 * Use `create(TokenDataSchema)` to create a new message.
 */
export declare const TokenDataSchema: GenMessage<TokenData>;
/**
 * @generated from message tokagent.v1.WalletAsset
 */
export type WalletAsset = Message<"tokagent.v1.WalletAsset"> & {
    /**
     * @generated from field: string address = 1;
     */
    address: string;
    /**
     * @generated from field: string balance = 2;
     */
    balance: string;
    /**
     * @generated from field: int32 decimals = 3;
     */
    decimals: number;
    /**
     * @generated from field: optional double ui_amount = 4;
     */
    uiAmount?: number;
    /**
     * @generated from field: optional string name = 5;
     */
    name?: string;
    /**
     * @generated from field: optional string symbol = 6;
     */
    symbol?: string;
    /**
     * @generated from field: optional string logo_uri = 7;
     */
    logoUri?: string;
    /**
     * @generated from field: optional double price_usd = 8;
     */
    priceUsd?: number;
    /**
     * @generated from field: optional double value_usd = 9;
     */
    valueUsd?: number;
};
/**
 * Describes the message tokagent.v1.WalletAsset.
 * Use `create(WalletAssetSchema)` to create a new message.
 */
export declare const WalletAssetSchema: GenMessage<WalletAsset>;
/**
 * @generated from message tokagent.v1.WalletPortfolio
 */
export type WalletPortfolio = Message<"tokagent.v1.WalletPortfolio"> & {
    /**
     * @generated from field: double total_value_usd = 1;
     */
    totalValueUsd: number;
    /**
     * @generated from field: repeated tokagent.v1.WalletAsset assets = 2;
     */
    assets: WalletAsset[];
};
/**
 * Describes the message tokagent.v1.WalletPortfolio.
 * Use `create(WalletPortfolioSchema)` to create a new message.
 */
export declare const WalletPortfolioSchema: GenMessage<WalletPortfolio>;
/**
 * @generated from message tokagent.v1.PoolTokenInfo
 */
export type PoolTokenInfo = Message<"tokagent.v1.PoolTokenInfo"> & {
    /**
     * @generated from field: string mint = 1;
     */
    mint: string;
    /**
     * @generated from field: optional string symbol = 2;
     */
    symbol?: string;
    /**
     * @generated from field: optional string reserve = 3;
     */
    reserve?: string;
    /**
     * @generated from field: optional int32 decimals = 4;
     */
    decimals?: number;
};
/**
 * Describes the message tokagent.v1.PoolTokenInfo.
 * Use `create(PoolTokenInfoSchema)` to create a new message.
 */
export declare const PoolTokenInfoSchema: GenMessage<PoolTokenInfo>;
/**
 * @generated from message tokagent.v1.PoolInfo
 */
export type PoolInfo = Message<"tokagent.v1.PoolInfo"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: optional string display_name = 2;
     */
    displayName?: string;
    /**
     * @generated from field: string dex = 3;
     */
    dex: string;
    /**
     * @generated from field: tokagent.v1.PoolTokenInfo token_a = 4;
     */
    tokenA?: PoolTokenInfo;
    /**
     * @generated from field: tokagent.v1.PoolTokenInfo token_b = 5;
     */
    tokenB?: PoolTokenInfo;
    /**
     * @generated from field: optional string lp_token_mint = 6;
     */
    lpTokenMint?: string;
    /**
     * @generated from field: optional double apr = 7;
     */
    apr?: number;
    /**
     * @generated from field: optional double apy = 8;
     */
    apy?: number;
    /**
     * @generated from field: optional double tvl = 9;
     */
    tvl?: number;
    /**
     * @generated from field: optional double fee = 10;
     */
    fee?: number;
    /**
     * @generated from field: google.protobuf.Struct metadata = 11;
     */
    metadata?: JsonObject;
};
/**
 * Describes the message tokagent.v1.PoolInfo.
 * Use `create(PoolInfoSchema)` to create a new message.
 */
export declare const PoolInfoSchema: GenMessage<PoolInfo>;
/**
 * @generated from message tokagent.v1.LpPositionDetails
 */
export type LpPositionDetails = Message<"tokagent.v1.LpPositionDetails"> & {
    /**
     * @generated from field: string pool_id = 1;
     */
    poolId: string;
    /**
     * @generated from field: string dex = 2;
     */
    dex: string;
    /**
     * @generated from field: tokagent.v1.TokenBalance lp_token_balance = 3;
     */
    lpTokenBalance?: TokenBalance;
    /**
     * @generated from field: repeated tokagent.v1.TokenBalance underlying_tokens = 4;
     */
    underlyingTokens: TokenBalance[];
    /**
     * @generated from field: optional double value_usd = 5;
     */
    valueUsd?: number;
    /**
     * @generated from field: repeated tokagent.v1.TokenBalance accrued_fees = 6;
     */
    accruedFees: TokenBalance[];
    /**
     * @generated from field: repeated tokagent.v1.TokenBalance rewards = 7;
     */
    rewards: TokenBalance[];
    /**
     * @generated from field: google.protobuf.Struct metadata = 8;
     */
    metadata?: JsonObject;
};
/**
 * Describes the message tokagent.v1.LpPositionDetails.
 * Use `create(LpPositionDetailsSchema)` to create a new message.
 */
export declare const LpPositionDetailsSchema: GenMessage<LpPositionDetails>;
/**
 * @generated from message tokagent.v1.TransactionResult
 */
export type TransactionResult = Message<"tokagent.v1.TransactionResult"> & {
    /**
     * @generated from field: bool success = 1;
     */
    success: boolean;
    /**
     * @generated from field: optional string transaction_id = 2;
     */
    transactionId?: string;
    /**
     * @generated from field: optional string error = 3;
     */
    error?: string;
    /**
     * @generated from field: google.protobuf.Struct data = 4;
     */
    data?: JsonObject;
};
/**
 * Describes the message tokagent.v1.TransactionResult.
 * Use `create(TransactionResultSchema)` to create a new message.
 */
export declare const TransactionResultSchema: GenMessage<TransactionResult>;
/**
 * @generated from message tokagent.v1.TranscriptionOptions
 */
export type TranscriptionOptions = Message<"tokagent.v1.TranscriptionOptions"> & {
    /**
     * @generated from field: optional string language = 1;
     */
    language?: string;
    /**
     * @generated from field: optional string model = 2;
     */
    model?: string;
    /**
     * @generated from field: optional double temperature = 3;
     */
    temperature?: number;
    /**
     * @generated from field: optional string prompt = 4;
     */
    prompt?: string;
    /**
     * @generated from field: optional string response_format = 5;
     */
    responseFormat?: string;
    /**
     * @generated from field: repeated string timestamp_granularities = 6;
     */
    timestampGranularities: string[];
    /**
     * @generated from field: optional bool word_timestamps = 7;
     */
    wordTimestamps?: boolean;
    /**
     * @generated from field: optional bool segment_timestamps = 8;
     */
    segmentTimestamps?: boolean;
};
/**
 * Describes the message tokagent.v1.TranscriptionOptions.
 * Use `create(TranscriptionOptionsSchema)` to create a new message.
 */
export declare const TranscriptionOptionsSchema: GenMessage<TranscriptionOptions>;
/**
 * @generated from message tokagent.v1.TranscriptionResult
 */
export type TranscriptionResult = Message<"tokagent.v1.TranscriptionResult"> & {
    /**
     * @generated from field: string text = 1;
     */
    text: string;
    /**
     * @generated from field: optional string language = 2;
     */
    language?: string;
    /**
     * @generated from field: optional double duration = 3;
     */
    duration?: number;
    /**
     * @generated from field: repeated tokagent.v1.TranscriptionSegment segments = 4;
     */
    segments: TranscriptionSegment[];
    /**
     * @generated from field: repeated tokagent.v1.TranscriptionWord words = 5;
     */
    words: TranscriptionWord[];
    /**
     * @generated from field: optional double confidence = 6;
     */
    confidence?: number;
};
/**
 * Describes the message tokagent.v1.TranscriptionResult.
 * Use `create(TranscriptionResultSchema)` to create a new message.
 */
export declare const TranscriptionResultSchema: GenMessage<TranscriptionResult>;
/**
 * @generated from message tokagent.v1.TranscriptionSegment
 */
export type TranscriptionSegment = Message<"tokagent.v1.TranscriptionSegment"> & {
    /**
     * @generated from field: int32 id = 1;
     */
    id: number;
    /**
     * @generated from field: string text = 2;
     */
    text: string;
    /**
     * @generated from field: double start = 3;
     */
    start: number;
    /**
     * @generated from field: double end = 4;
     */
    end: number;
    /**
     * @generated from field: optional double confidence = 5;
     */
    confidence?: number;
    /**
     * @generated from field: repeated int32 tokens = 6;
     */
    tokens: number[];
    /**
     * @generated from field: optional double temperature = 7;
     */
    temperature?: number;
    /**
     * @generated from field: optional double avg_logprob = 8;
     */
    avgLogprob?: number;
    /**
     * @generated from field: optional double compression_ratio = 9;
     */
    compressionRatio?: number;
    /**
     * @generated from field: optional double no_speech_prob = 10;
     */
    noSpeechProb?: number;
};
/**
 * Describes the message tokagent.v1.TranscriptionSegment.
 * Use `create(TranscriptionSegmentSchema)` to create a new message.
 */
export declare const TranscriptionSegmentSchema: GenMessage<TranscriptionSegment>;
/**
 * @generated from message tokagent.v1.TranscriptionWord
 */
export type TranscriptionWord = Message<"tokagent.v1.TranscriptionWord"> & {
    /**
     * @generated from field: string word = 1;
     */
    word: string;
    /**
     * @generated from field: double start = 2;
     */
    start: number;
    /**
     * @generated from field: double end = 3;
     */
    end: number;
    /**
     * @generated from field: optional double confidence = 4;
     */
    confidence?: number;
};
/**
 * Describes the message tokagent.v1.TranscriptionWord.
 * Use `create(TranscriptionWordSchema)` to create a new message.
 */
export declare const TranscriptionWordSchema: GenMessage<TranscriptionWord>;
/**
 * @generated from message tokagent.v1.SpeechToTextOptions
 */
export type SpeechToTextOptions = Message<"tokagent.v1.SpeechToTextOptions"> & {
    /**
     * @generated from field: optional string language = 1;
     */
    language?: string;
    /**
     * @generated from field: optional string model = 2;
     */
    model?: string;
    /**
     * @generated from field: optional bool continuous = 3;
     */
    continuous?: boolean;
    /**
     * @generated from field: optional bool interim_results = 4;
     */
    interimResults?: boolean;
    /**
     * @generated from field: optional int32 max_alternatives = 5;
     */
    maxAlternatives?: number;
};
/**
 * Describes the message tokagent.v1.SpeechToTextOptions.
 * Use `create(SpeechToTextOptionsSchema)` to create a new message.
 */
export declare const SpeechToTextOptionsSchema: GenMessage<SpeechToTextOptions>;
/**
 * @generated from message tokagent.v1.TextToSpeechOptions
 */
export type TextToSpeechOptions = Message<"tokagent.v1.TextToSpeechOptions"> & {
    /**
     * @generated from field: optional string voice = 1;
     */
    voice?: string;
    /**
     * @generated from field: optional string model = 2;
     */
    model?: string;
    /**
     * @generated from field: optional double speed = 3;
     */
    speed?: number;
    /**
     * @generated from field: optional string format = 4;
     */
    format?: string;
    /**
     * @generated from field: optional string response_format = 5;
     */
    responseFormat?: string;
};
/**
 * Describes the message tokagent.v1.TextToSpeechOptions.
 * Use `create(TextToSpeechOptionsSchema)` to create a new message.
 */
export declare const TextToSpeechOptionsSchema: GenMessage<TextToSpeechOptions>;
/**
 * @generated from message tokagent.v1.VideoInfo
 */
export type VideoInfo = Message<"tokagent.v1.VideoInfo"> & {
    /**
     * @generated from field: optional string title = 1;
     */
    title?: string;
    /**
     * @generated from field: optional double duration = 2;
     */
    duration?: number;
    /**
     * @generated from field: string url = 3;
     */
    url: string;
    /**
     * @generated from field: optional string thumbnail = 4;
     */
    thumbnail?: string;
    /**
     * @generated from field: optional string description = 5;
     */
    description?: string;
    /**
     * @generated from field: optional string uploader = 6;
     */
    uploader?: string;
    /**
     * @generated from field: optional double view_count = 7;
     */
    viewCount?: number;
    /**
     * @generated from field: optional google.protobuf.Timestamp upload_date = 8;
     */
    uploadDate?: Timestamp;
    /**
     * @generated from field: repeated tokagent.v1.VideoFormat formats = 9;
     */
    formats: VideoFormat[];
};
/**
 * Describes the message tokagent.v1.VideoInfo.
 * Use `create(VideoInfoSchema)` to create a new message.
 */
export declare const VideoInfoSchema: GenMessage<VideoInfo>;
/**
 * @generated from message tokagent.v1.VideoFormat
 */
export type VideoFormat = Message<"tokagent.v1.VideoFormat"> & {
    /**
     * @generated from field: string format_id = 1;
     */
    formatId: string;
    /**
     * @generated from field: string url = 2;
     */
    url: string;
    /**
     * @generated from field: string extension = 3;
     */
    extension: string;
    /**
     * @generated from field: string quality = 4;
     */
    quality: string;
    /**
     * @generated from field: optional int64 file_size = 5;
     */
    fileSize?: bigint;
    /**
     * @generated from field: optional string video_codec = 6;
     */
    videoCodec?: string;
    /**
     * @generated from field: optional string audio_codec = 7;
     */
    audioCodec?: string;
    /**
     * @generated from field: optional string resolution = 8;
     */
    resolution?: string;
    /**
     * @generated from field: optional double fps = 9;
     */
    fps?: number;
    /**
     * @generated from field: optional double bitrate = 10;
     */
    bitrate?: number;
};
/**
 * Describes the message tokagent.v1.VideoFormat.
 * Use `create(VideoFormatSchema)` to create a new message.
 */
export declare const VideoFormatSchema: GenMessage<VideoFormat>;
/**
 * @generated from message tokagent.v1.VideoDownloadOptions
 */
export type VideoDownloadOptions = Message<"tokagent.v1.VideoDownloadOptions"> & {
    /**
     * @generated from field: optional string format = 1;
     */
    format?: string;
    /**
     * @generated from field: optional string quality = 2;
     */
    quality?: string;
    /**
     * @generated from field: optional string output_path = 3;
     */
    outputPath?: string;
    /**
     * @generated from field: optional bool audio_only = 4;
     */
    audioOnly?: boolean;
    /**
     * @generated from field: optional bool video_only = 5;
     */
    videoOnly?: boolean;
    /**
     * @generated from field: optional bool subtitles = 6;
     */
    subtitles?: boolean;
    /**
     * @generated from field: optional bool embed_subs = 7;
     */
    embedSubs?: boolean;
    /**
     * @generated from field: optional bool write_info_json = 8;
     */
    writeInfoJson?: boolean;
};
/**
 * Describes the message tokagent.v1.VideoDownloadOptions.
 * Use `create(VideoDownloadOptionsSchema)` to create a new message.
 */
export declare const VideoDownloadOptionsSchema: GenMessage<VideoDownloadOptions>;
/**
 * @generated from message tokagent.v1.VideoProcessingOptions
 */
export type VideoProcessingOptions = Message<"tokagent.v1.VideoProcessingOptions"> & {
    /**
     * @generated from field: optional double start_time = 1;
     */
    startTime?: number;
    /**
     * @generated from field: optional double end_time = 2;
     */
    endTime?: number;
    /**
     * @generated from field: optional string output_format = 3;
     */
    outputFormat?: string;
    /**
     * @generated from field: optional string resolution = 4;
     */
    resolution?: string;
    /**
     * @generated from field: optional string bitrate = 5;
     */
    bitrate?: string;
    /**
     * @generated from field: optional double framerate = 6;
     */
    framerate?: number;
    /**
     * @generated from field: optional string audio_codec = 7;
     */
    audioCodec?: string;
    /**
     * @generated from field: optional string video_codec = 8;
     */
    videoCodec?: string;
};
/**
 * Describes the message tokagent.v1.VideoProcessingOptions.
 * Use `create(VideoProcessingOptionsSchema)` to create a new message.
 */
export declare const VideoProcessingOptionsSchema: GenMessage<VideoProcessingOptions>;
/**
 * @generated from message tokagent.v1.BrowserViewport
 */
export type BrowserViewport = Message<"tokagent.v1.BrowserViewport"> & {
    /**
     * @generated from field: int32 width = 1;
     */
    width: number;
    /**
     * @generated from field: int32 height = 2;
     */
    height: number;
};
/**
 * Describes the message tokagent.v1.BrowserViewport.
 * Use `create(BrowserViewportSchema)` to create a new message.
 */
export declare const BrowserViewportSchema: GenMessage<BrowserViewport>;
/**
 * @generated from message tokagent.v1.BrowserNavigationOptions
 */
export type BrowserNavigationOptions = Message<"tokagent.v1.BrowserNavigationOptions"> & {
    /**
     * @generated from field: optional int32 timeout = 1;
     */
    timeout?: number;
    /**
     * @generated from field: optional string wait_until = 2;
     */
    waitUntil?: string;
    /**
     * @generated from field: optional tokagent.v1.BrowserViewport viewport = 3;
     */
    viewport?: BrowserViewport;
    /**
     * @generated from field: optional string user_agent = 4;
     */
    userAgent?: string;
    /**
     * @generated from field: map<string, string> headers = 5;
     */
    headers: {
        [key: string]: string;
    };
};
/**
 * Describes the message tokagent.v1.BrowserNavigationOptions.
 * Use `create(BrowserNavigationOptionsSchema)` to create a new message.
 */
export declare const BrowserNavigationOptionsSchema: GenMessage<BrowserNavigationOptions>;
/**
 * @generated from message tokagent.v1.ScreenshotClip
 */
export type ScreenshotClip = Message<"tokagent.v1.ScreenshotClip"> & {
    /**
     * @generated from field: int32 x = 1;
     */
    x: number;
    /**
     * @generated from field: int32 y = 2;
     */
    y: number;
    /**
     * @generated from field: int32 width = 3;
     */
    width: number;
    /**
     * @generated from field: int32 height = 4;
     */
    height: number;
};
/**
 * Describes the message tokagent.v1.ScreenshotClip.
 * Use `create(ScreenshotClipSchema)` to create a new message.
 */
export declare const ScreenshotClipSchema: GenMessage<ScreenshotClip>;
/**
 * @generated from message tokagent.v1.ScreenshotOptions
 */
export type ScreenshotOptions = Message<"tokagent.v1.ScreenshotOptions"> & {
    /**
     * @generated from field: optional bool full_page = 1;
     */
    fullPage?: boolean;
    /**
     * @generated from field: optional tokagent.v1.ScreenshotClip clip = 2;
     */
    clip?: ScreenshotClip;
    /**
     * @generated from field: optional string format = 3;
     */
    format?: string;
    /**
     * @generated from field: optional int32 quality = 4;
     */
    quality?: number;
    /**
     * @generated from field: optional bool omit_background = 5;
     */
    omitBackground?: boolean;
};
/**
 * Describes the message tokagent.v1.ScreenshotOptions.
 * Use `create(ScreenshotOptionsSchema)` to create a new message.
 */
export declare const ScreenshotOptionsSchema: GenMessage<ScreenshotOptions>;
/**
 * @generated from message tokagent.v1.ElementSelector
 */
export type ElementSelector = Message<"tokagent.v1.ElementSelector"> & {
    /**
     * @generated from field: string selector = 1;
     */
    selector: string;
    /**
     * @generated from field: optional string text = 2;
     */
    text?: string;
    /**
     * @generated from field: optional int32 timeout = 3;
     */
    timeout?: number;
};
/**
 * Describes the message tokagent.v1.ElementSelector.
 * Use `create(ElementSelectorSchema)` to create a new message.
 */
export declare const ElementSelectorSchema: GenMessage<ElementSelector>;
/**
 * @generated from message tokagent.v1.LinkInfo
 */
export type LinkInfo = Message<"tokagent.v1.LinkInfo"> & {
    /**
     * @generated from field: string url = 1;
     */
    url: string;
    /**
     * @generated from field: string text = 2;
     */
    text: string;
};
/**
 * Describes the message tokagent.v1.LinkInfo.
 * Use `create(LinkInfoSchema)` to create a new message.
 */
export declare const LinkInfoSchema: GenMessage<LinkInfo>;
/**
 * @generated from message tokagent.v1.ImageInfo
 */
export type ImageInfo = Message<"tokagent.v1.ImageInfo"> & {
    /**
     * @generated from field: string src = 1;
     */
    src: string;
    /**
     * @generated from field: optional string alt = 2;
     */
    alt?: string;
};
/**
 * Describes the message tokagent.v1.ImageInfo.
 * Use `create(ImageInfoSchema)` to create a new message.
 */
export declare const ImageInfoSchema: GenMessage<ImageInfo>;
/**
 * @generated from message tokagent.v1.ExtractedContent
 */
export type ExtractedContent = Message<"tokagent.v1.ExtractedContent"> & {
    /**
     * @generated from field: string text = 1;
     */
    text: string;
    /**
     * @generated from field: string html = 2;
     */
    html: string;
    /**
     * @generated from field: repeated tokagent.v1.LinkInfo links = 3;
     */
    links: LinkInfo[];
    /**
     * @generated from field: repeated tokagent.v1.ImageInfo images = 4;
     */
    images: ImageInfo[];
    /**
     * @generated from field: optional string title = 5;
     */
    title?: string;
    /**
     * @generated from field: map<string, string> metadata = 6;
     */
    metadata: {
        [key: string]: string;
    };
};
/**
 * Describes the message tokagent.v1.ExtractedContent.
 * Use `create(ExtractedContentSchema)` to create a new message.
 */
export declare const ExtractedContentSchema: GenMessage<ExtractedContent>;
/**
 * @generated from message tokagent.v1.ClickOptions
 */
export type ClickOptions = Message<"tokagent.v1.ClickOptions"> & {
    /**
     * @generated from field: optional int32 timeout = 1;
     */
    timeout?: number;
    /**
     * @generated from field: optional bool force = 2;
     */
    force?: boolean;
    /**
     * @generated from field: optional bool wait_for_navigation = 3;
     */
    waitForNavigation?: boolean;
};
/**
 * Describes the message tokagent.v1.ClickOptions.
 * Use `create(ClickOptionsSchema)` to create a new message.
 */
export declare const ClickOptionsSchema: GenMessage<ClickOptions>;
/**
 * @generated from message tokagent.v1.TypeOptions
 */
export type TypeOptions = Message<"tokagent.v1.TypeOptions"> & {
    /**
     * @generated from field: optional int32 delay = 1;
     */
    delay?: number;
    /**
     * @generated from field: optional int32 timeout = 2;
     */
    timeout?: number;
    /**
     * @generated from field: optional bool clear = 3;
     */
    clear?: boolean;
};
/**
 * Describes the message tokagent.v1.TypeOptions.
 * Use `create(TypeOptionsSchema)` to create a new message.
 */
export declare const TypeOptionsSchema: GenMessage<TypeOptions>;
/**
 * @generated from message tokagent.v1.PdfMetadata
 */
export type PdfMetadata = Message<"tokagent.v1.PdfMetadata"> & {
    /**
     * @generated from field: optional string title = 1;
     */
    title?: string;
    /**
     * @generated from field: optional string author = 2;
     */
    author?: string;
    /**
     * @generated from field: optional google.protobuf.Timestamp created_at = 3;
     */
    createdAt?: Timestamp;
    /**
     * @generated from field: optional google.protobuf.Timestamp modified_at = 4;
     */
    modifiedAt?: Timestamp;
};
/**
 * Describes the message tokagent.v1.PdfMetadata.
 * Use `create(PdfMetadataSchema)` to create a new message.
 */
export declare const PdfMetadataSchema: GenMessage<PdfMetadata>;
/**
 * @generated from message tokagent.v1.PdfExtractionResult
 */
export type PdfExtractionResult = Message<"tokagent.v1.PdfExtractionResult"> & {
    /**
     * @generated from field: string text = 1;
     */
    text: string;
    /**
     * @generated from field: int32 page_count = 2;
     */
    pageCount: number;
    /**
     * @generated from field: optional tokagent.v1.PdfMetadata metadata = 3;
     */
    metadata?: PdfMetadata;
};
/**
 * Describes the message tokagent.v1.PdfExtractionResult.
 * Use `create(PdfExtractionResultSchema)` to create a new message.
 */
export declare const PdfExtractionResultSchema: GenMessage<PdfExtractionResult>;
/**
 * @generated from message tokagent.v1.PdfMargins
 */
export type PdfMargins = Message<"tokagent.v1.PdfMargins"> & {
    /**
     * @generated from field: optional double top = 1;
     */
    top?: number;
    /**
     * @generated from field: optional double bottom = 2;
     */
    bottom?: number;
    /**
     * @generated from field: optional double left = 3;
     */
    left?: number;
    /**
     * @generated from field: optional double right = 4;
     */
    right?: number;
};
/**
 * Describes the message tokagent.v1.PdfMargins.
 * Use `create(PdfMarginsSchema)` to create a new message.
 */
export declare const PdfMarginsSchema: GenMessage<PdfMargins>;
/**
 * @generated from message tokagent.v1.PdfGenerationOptions
 */
export type PdfGenerationOptions = Message<"tokagent.v1.PdfGenerationOptions"> & {
    /**
     * @generated from field: optional string format = 1;
     */
    format?: string;
    /**
     * @generated from field: optional string orientation = 2;
     */
    orientation?: string;
    /**
     * @generated from field: optional tokagent.v1.PdfMargins margins = 3;
     */
    margins?: PdfMargins;
    /**
     * @generated from field: optional string header = 4;
     */
    header?: string;
    /**
     * @generated from field: optional string footer = 5;
     */
    footer?: string;
};
/**
 * Describes the message tokagent.v1.PdfGenerationOptions.
 * Use `create(PdfGenerationOptionsSchema)` to create a new message.
 */
export declare const PdfGenerationOptionsSchema: GenMessage<PdfGenerationOptions>;
/**
 * @generated from message tokagent.v1.PdfConversionOptions
 */
export type PdfConversionOptions = Message<"tokagent.v1.PdfConversionOptions"> & {
    /**
     * @generated from field: optional string quality = 1;
     */
    quality?: string;
    /**
     * @generated from field: optional string output_format = 2;
     */
    outputFormat?: string;
    /**
     * @generated from field: optional bool compression = 3;
     */
    compression?: boolean;
};
/**
 * Describes the message tokagent.v1.PdfConversionOptions.
 * Use `create(PdfConversionOptionsSchema)` to create a new message.
 */
export declare const PdfConversionOptionsSchema: GenMessage<PdfConversionOptions>;
/**
 * @generated from message tokagent.v1.DateRange
 */
export type DateRange = Message<"tokagent.v1.DateRange"> & {
    /**
     * @generated from field: optional google.protobuf.Timestamp start = 1;
     */
    start?: Timestamp;
    /**
     * @generated from field: optional google.protobuf.Timestamp end = 2;
     */
    end?: Timestamp;
};
/**
 * Describes the message tokagent.v1.DateRange.
 * Use `create(DateRangeSchema)` to create a new message.
 */
export declare const DateRangeSchema: GenMessage<DateRange>;
/**
 * @generated from message tokagent.v1.SearchOptions
 */
export type SearchOptions = Message<"tokagent.v1.SearchOptions"> & {
    /**
     * @generated from field: optional int32 limit = 1;
     */
    limit?: number;
    /**
     * @generated from field: optional int32 offset = 2;
     */
    offset?: number;
    /**
     * @generated from field: optional string language = 3;
     */
    language?: string;
    /**
     * @generated from field: optional string region = 4;
     */
    region?: string;
    /**
     * @generated from field: optional tokagent.v1.DateRange date_range = 5;
     */
    dateRange?: DateRange;
    /**
     * @generated from field: optional string file_type = 6;
     */
    fileType?: string;
    /**
     * @generated from field: optional string site = 7;
     */
    site?: string;
    /**
     * @generated from field: optional string sort_by = 8;
     */
    sortBy?: string;
    /**
     * @generated from field: optional string safe_search = 9;
     */
    safeSearch?: string;
};
/**
 * Describes the message tokagent.v1.SearchOptions.
 * Use `create(SearchOptionsSchema)` to create a new message.
 */
export declare const SearchOptionsSchema: GenMessage<SearchOptions>;
/**
 * @generated from message tokagent.v1.SearchResult
 */
export type SearchResult = Message<"tokagent.v1.SearchResult"> & {
    /**
     * @generated from field: string title = 1;
     */
    title: string;
    /**
     * @generated from field: string url = 2;
     */
    url: string;
    /**
     * @generated from field: string description = 3;
     */
    description: string;
    /**
     * @generated from field: optional string display_url = 4;
     */
    displayUrl?: string;
    /**
     * @generated from field: optional string thumbnail = 5;
     */
    thumbnail?: string;
    /**
     * @generated from field: optional google.protobuf.Timestamp published_date = 6;
     */
    publishedDate?: Timestamp;
    /**
     * @generated from field: optional string source = 7;
     */
    source?: string;
    /**
     * @generated from field: optional double relevance_score = 8;
     */
    relevanceScore?: number;
    /**
     * @generated from field: optional string snippet = 9;
     */
    snippet?: string;
};
/**
 * Describes the message tokagent.v1.SearchResult.
 * Use `create(SearchResultSchema)` to create a new message.
 */
export declare const SearchResultSchema: GenMessage<SearchResult>;
/**
 * @generated from message tokagent.v1.SearchResponse
 */
export type SearchResponse = Message<"tokagent.v1.SearchResponse"> & {
    /**
     * @generated from field: string query = 1;
     */
    query: string;
    /**
     * @generated from field: repeated tokagent.v1.SearchResult results = 2;
     */
    results: SearchResult[];
    /**
     * @generated from field: optional int32 total_results = 3;
     */
    totalResults?: number;
    /**
     * @generated from field: optional double search_time = 4;
     */
    searchTime?: number;
    /**
     * @generated from field: repeated string suggestions = 5;
     */
    suggestions: string[];
    /**
     * @generated from field: optional string next_page_token = 6;
     */
    nextPageToken?: string;
    /**
     * @generated from field: repeated string related_searches = 7;
     */
    relatedSearches: string[];
};
/**
 * Describes the message tokagent.v1.SearchResponse.
 * Use `create(SearchResponseSchema)` to create a new message.
 */
export declare const SearchResponseSchema: GenMessage<SearchResponse>;
/**
 * @generated from message tokagent.v1.NewsSearchOptions
 */
export type NewsSearchOptions = Message<"tokagent.v1.NewsSearchOptions"> & {
    /**
     * @generated from field: tokagent.v1.SearchOptions base = 1;
     */
    base?: SearchOptions;
    /**
     * @generated from field: optional string category = 2;
     */
    category?: string;
    /**
     * @generated from field: optional string freshness = 3;
     */
    freshness?: string;
};
/**
 * Describes the message tokagent.v1.NewsSearchOptions.
 * Use `create(NewsSearchOptionsSchema)` to create a new message.
 */
export declare const NewsSearchOptionsSchema: GenMessage<NewsSearchOptions>;
/**
 * @generated from message tokagent.v1.ImageSearchOptions
 */
export type ImageSearchOptions = Message<"tokagent.v1.ImageSearchOptions"> & {
    /**
     * @generated from field: tokagent.v1.SearchOptions base = 1;
     */
    base?: SearchOptions;
    /**
     * @generated from field: optional string size = 2;
     */
    size?: string;
    /**
     * @generated from field: optional string color = 3;
     */
    color?: string;
    /**
     * @generated from field: optional string type = 4;
     */
    type?: string;
    /**
     * @generated from field: optional string layout = 5;
     */
    layout?: string;
    /**
     * @generated from field: optional string license = 6;
     */
    license?: string;
};
/**
 * Describes the message tokagent.v1.ImageSearchOptions.
 * Use `create(ImageSearchOptionsSchema)` to create a new message.
 */
export declare const ImageSearchOptionsSchema: GenMessage<ImageSearchOptions>;
/**
 * @generated from message tokagent.v1.VideoSearchOptions
 */
export type VideoSearchOptions = Message<"tokagent.v1.VideoSearchOptions"> & {
    /**
     * @generated from field: tokagent.v1.SearchOptions base = 1;
     */
    base?: SearchOptions;
    /**
     * @generated from field: optional string duration = 2;
     */
    duration?: string;
    /**
     * @generated from field: optional string resolution = 3;
     */
    resolution?: string;
    /**
     * @generated from field: optional string quality = 4;
     */
    quality?: string;
};
/**
 * Describes the message tokagent.v1.VideoSearchOptions.
 * Use `create(VideoSearchOptionsSchema)` to create a new message.
 */
export declare const VideoSearchOptionsSchema: GenMessage<VideoSearchOptions>;
/**
 * @generated from message tokagent.v1.EmailAddress
 */
export type EmailAddress = Message<"tokagent.v1.EmailAddress"> & {
    /**
     * @generated from field: string email = 1;
     */
    email: string;
    /**
     * @generated from field: optional string name = 2;
     */
    name?: string;
};
/**
 * Describes the message tokagent.v1.EmailAddress.
 * Use `create(EmailAddressSchema)` to create a new message.
 */
export declare const EmailAddressSchema: GenMessage<EmailAddress>;
/**
 * @generated from message tokagent.v1.EmailAttachment
 */
export type EmailAttachment = Message<"tokagent.v1.EmailAttachment"> & {
    /**
     * @generated from field: string filename = 1;
     */
    filename: string;
    /**
     * @generated from oneof tokagent.v1.EmailAttachment.content
     */
    content: {
        /**
         * @generated from field: bytes content_bytes = 2;
         */
        value: Uint8Array;
        case: "contentBytes";
    } | {
        /**
         * @generated from field: string content_text = 3;
         */
        value: string;
        case: "contentText";
    } | {
        case: undefined;
        value?: undefined;
    };
    /**
     * @generated from field: optional string content_type = 4;
     */
    contentType?: string;
    /**
     * @generated from field: optional string content_disposition = 5;
     */
    contentDisposition?: string;
    /**
     * @generated from field: optional string cid = 6;
     */
    cid?: string;
};
/**
 * Describes the message tokagent.v1.EmailAttachment.
 * Use `create(EmailAttachmentSchema)` to create a new message.
 */
export declare const EmailAttachmentSchema: GenMessage<EmailAttachment>;
/**
 * @generated from message tokagent.v1.EmailMessage
 */
export type EmailMessage = Message<"tokagent.v1.EmailMessage"> & {
    /**
     * @generated from field: tokagent.v1.EmailAddress from = 1;
     */
    from?: EmailAddress;
    /**
     * @generated from field: repeated tokagent.v1.EmailAddress to = 2;
     */
    to: EmailAddress[];
    /**
     * @generated from field: repeated tokagent.v1.EmailAddress cc = 3;
     */
    cc: EmailAddress[];
    /**
     * @generated from field: repeated tokagent.v1.EmailAddress bcc = 4;
     */
    bcc: EmailAddress[];
    /**
     * @generated from field: string subject = 5;
     */
    subject: string;
    /**
     * @generated from field: optional string text = 6;
     */
    text?: string;
    /**
     * @generated from field: optional string html = 7;
     */
    html?: string;
    /**
     * @generated from field: repeated tokagent.v1.EmailAttachment attachments = 8;
     */
    attachments: EmailAttachment[];
    /**
     * @generated from field: optional tokagent.v1.EmailAddress reply_to = 9;
     */
    replyTo?: EmailAddress;
    /**
     * @generated from field: optional google.protobuf.Timestamp date = 10;
     */
    date?: Timestamp;
    /**
     * @generated from field: optional string message_id = 11;
     */
    messageId?: string;
    /**
     * @generated from field: repeated string references = 12;
     */
    references: string[];
    /**
     * @generated from field: optional string in_reply_to = 13;
     */
    inReplyTo?: string;
    /**
     * @generated from field: optional string priority = 14;
     */
    priority?: string;
};
/**
 * Describes the message tokagent.v1.EmailMessage.
 * Use `create(EmailMessageSchema)` to create a new message.
 */
export declare const EmailMessageSchema: GenMessage<EmailMessage>;
/**
 * @generated from message tokagent.v1.EmailSendOptions
 */
export type EmailSendOptions = Message<"tokagent.v1.EmailSendOptions"> & {
    /**
     * @generated from field: optional int32 retry = 1;
     */
    retry?: number;
    /**
     * @generated from field: optional int32 timeout = 2;
     */
    timeout?: number;
    /**
     * @generated from field: optional bool track_opens = 3;
     */
    trackOpens?: boolean;
    /**
     * @generated from field: optional bool track_clicks = 4;
     */
    trackClicks?: boolean;
    /**
     * @generated from field: repeated string tags = 5;
     */
    tags: string[];
};
/**
 * Describes the message tokagent.v1.EmailSendOptions.
 * Use `create(EmailSendOptionsSchema)` to create a new message.
 */
export declare const EmailSendOptionsSchema: GenMessage<EmailSendOptions>;
/**
 * @generated from message tokagent.v1.EmailSearchOptions
 */
export type EmailSearchOptions = Message<"tokagent.v1.EmailSearchOptions"> & {
    /**
     * @generated from field: optional string query = 1;
     */
    query?: string;
    /**
     * @generated from field: optional string from = 2;
     */
    from?: string;
    /**
     * @generated from field: optional string to = 3;
     */
    to?: string;
    /**
     * @generated from field: optional string subject = 4;
     */
    subject?: string;
    /**
     * @generated from field: optional string folder = 5;
     */
    folder?: string;
    /**
     * @generated from field: optional google.protobuf.Timestamp since = 6;
     */
    since?: Timestamp;
    /**
     * @generated from field: optional google.protobuf.Timestamp before = 7;
     */
    before?: Timestamp;
    /**
     * @generated from field: optional int32 limit = 8;
     */
    limit?: number;
    /**
     * @generated from field: optional int32 offset = 9;
     */
    offset?: number;
    /**
     * @generated from field: optional bool unread = 10;
     */
    unread?: boolean;
    /**
     * @generated from field: optional bool flagged = 11;
     */
    flagged?: boolean;
    /**
     * @generated from field: optional bool has_attachments = 12;
     */
    hasAttachments?: boolean;
};
/**
 * Describes the message tokagent.v1.EmailSearchOptions.
 * Use `create(EmailSearchOptionsSchema)` to create a new message.
 */
export declare const EmailSearchOptionsSchema: GenMessage<EmailSearchOptions>;
/**
 * @generated from message tokagent.v1.EmailFolder
 */
export type EmailFolder = Message<"tokagent.v1.EmailFolder"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string path = 2;
     */
    path: string;
    /**
     * @generated from field: string type = 3;
     */
    type: string;
    /**
     * @generated from field: optional int32 message_count = 4;
     */
    messageCount?: number;
    /**
     * @generated from field: optional int32 unread_count = 5;
     */
    unreadCount?: number;
    /**
     * @generated from field: repeated tokagent.v1.EmailFolder children = 6;
     */
    children: EmailFolder[];
};
/**
 * Describes the message tokagent.v1.EmailFolder.
 * Use `create(EmailFolderSchema)` to create a new message.
 */
export declare const EmailFolderSchema: GenMessage<EmailFolder>;
/**
 * @generated from message tokagent.v1.EmailAccount
 */
export type EmailAccount = Message<"tokagent.v1.EmailAccount"> & {
    /**
     * @generated from field: string email = 1;
     */
    email: string;
    /**
     * @generated from field: optional string name = 2;
     */
    name?: string;
    /**
     * @generated from field: optional string provider = 3;
     */
    provider?: string;
    /**
     * @generated from field: repeated tokagent.v1.EmailFolder folders = 4;
     */
    folders: EmailFolder[];
    /**
     * @generated from field: optional int64 quota_used = 5;
     */
    quotaUsed?: bigint;
    /**
     * @generated from field: optional int64 quota_limit = 6;
     */
    quotaLimit?: bigint;
};
/**
 * Describes the message tokagent.v1.EmailAccount.
 * Use `create(EmailAccountSchema)` to create a new message.
 */
export declare const EmailAccountSchema: GenMessage<EmailAccount>;
/**
 * @generated from message tokagent.v1.MessageParticipant
 */
export type MessageParticipant = Message<"tokagent.v1.MessageParticipant"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string name = 2;
     */
    name: string;
    /**
     * @generated from field: optional string username = 3;
     */
    username?: string;
    /**
     * @generated from field: optional string avatar = 4;
     */
    avatar?: string;
    /**
     * @generated from field: optional string status = 5;
     */
    status?: string;
};
/**
 * Describes the message tokagent.v1.MessageParticipant.
 * Use `create(MessageParticipantSchema)` to create a new message.
 */
export declare const MessageParticipantSchema: GenMessage<MessageParticipant>;
/**
 * @generated from message tokagent.v1.MessageAttachment
 */
export type MessageAttachment = Message<"tokagent.v1.MessageAttachment"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string filename = 2;
     */
    filename: string;
    /**
     * @generated from field: string url = 3;
     */
    url: string;
    /**
     * @generated from field: string mime_type = 4;
     */
    mimeType: string;
    /**
     * @generated from field: int64 size = 5;
     */
    size: bigint;
    /**
     * @generated from field: optional int32 width = 6;
     */
    width?: number;
    /**
     * @generated from field: optional int32 height = 7;
     */
    height?: number;
    /**
     * @generated from field: optional double duration = 8;
     */
    duration?: number;
    /**
     * @generated from field: optional string thumbnail = 9;
     */
    thumbnail?: string;
};
/**
 * Describes the message tokagent.v1.MessageAttachment.
 * Use `create(MessageAttachmentSchema)` to create a new message.
 */
export declare const MessageAttachmentSchema: GenMessage<MessageAttachment>;
/**
 * @generated from message tokagent.v1.MessageReaction
 */
export type MessageReaction = Message<"tokagent.v1.MessageReaction"> & {
    /**
     * @generated from field: string emoji = 1;
     */
    emoji: string;
    /**
     * @generated from field: int32 count = 2;
     */
    count: number;
    /**
     * @generated from field: repeated string users = 3;
     */
    users: string[];
    /**
     * @generated from field: bool has_reacted = 4;
     */
    hasReacted: boolean;
};
/**
 * Describes the message tokagent.v1.MessageReaction.
 * Use `create(MessageReactionSchema)` to create a new message.
 */
export declare const MessageReactionSchema: GenMessage<MessageReaction>;
/**
 * @generated from message tokagent.v1.MessageReference
 */
export type MessageReference = Message<"tokagent.v1.MessageReference"> & {
    /**
     * @generated from field: string message_id = 1;
     */
    messageId: string;
    /**
     * @generated from field: string channel_id = 2;
     */
    channelId: string;
    /**
     * @generated from field: string type = 3;
     */
    type: string;
};
/**
 * Describes the message tokagent.v1.MessageReference.
 * Use `create(MessageReferenceSchema)` to create a new message.
 */
export declare const MessageReferenceSchema: GenMessage<MessageReference>;
/**
 * @generated from message tokagent.v1.EmbedField
 */
export type EmbedField = Message<"tokagent.v1.EmbedField"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string value = 2;
     */
    value: string;
    /**
     * @generated from field: optional bool inline = 3;
     */
    inline?: boolean;
};
/**
 * Describes the message tokagent.v1.EmbedField.
 * Use `create(EmbedFieldSchema)` to create a new message.
 */
export declare const EmbedFieldSchema: GenMessage<EmbedField>;
/**
 * @generated from message tokagent.v1.MessageEmbed
 */
export type MessageEmbed = Message<"tokagent.v1.MessageEmbed"> & {
    /**
     * @generated from field: optional string title = 1;
     */
    title?: string;
    /**
     * @generated from field: optional string description = 2;
     */
    description?: string;
    /**
     * @generated from field: optional string url = 3;
     */
    url?: string;
    /**
     * @generated from field: optional string image = 4;
     */
    image?: string;
    /**
     * @generated from field: repeated tokagent.v1.EmbedField fields = 5;
     */
    fields: EmbedField[];
};
/**
 * Describes the message tokagent.v1.MessageEmbed.
 * Use `create(MessageEmbedSchema)` to create a new message.
 */
export declare const MessageEmbedSchema: GenMessage<MessageEmbed>;
/**
 * @generated from message tokagent.v1.MessageContent
 */
export type MessageContent = Message<"tokagent.v1.MessageContent"> & {
    /**
     * @generated from field: optional string text = 1;
     */
    text?: string;
    /**
     * @generated from field: optional string html = 2;
     */
    html?: string;
    /**
     * @generated from field: optional string markdown = 3;
     */
    markdown?: string;
    /**
     * @generated from field: repeated tokagent.v1.MessageAttachment attachments = 4;
     */
    attachments: MessageAttachment[];
    /**
     * @generated from field: repeated tokagent.v1.MessageReaction reactions = 5;
     */
    reactions: MessageReaction[];
    /**
     * @generated from field: optional tokagent.v1.MessageReference reference = 6;
     */
    reference?: MessageReference;
    /**
     * @generated from field: repeated string mentions = 7;
     */
    mentions: string[];
    /**
     * @generated from field: repeated tokagent.v1.MessageEmbed embeds = 8;
     */
    embeds: MessageEmbed[];
};
/**
 * Describes the message tokagent.v1.MessageContent.
 * Use `create(MessageContentSchema)` to create a new message.
 */
export declare const MessageContentSchema: GenMessage<MessageContent>;
/**
 * @generated from message tokagent.v1.MessageThreadInfo
 */
export type MessageThreadInfo = Message<"tokagent.v1.MessageThreadInfo"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: int32 message_count = 2;
     */
    messageCount: number;
    /**
     * @generated from field: repeated string participants = 3;
     */
    participants: string[];
    /**
     * @generated from field: google.protobuf.Timestamp last_message_at = 4;
     */
    lastMessageAt?: Timestamp;
};
/**
 * Describes the message tokagent.v1.MessageThreadInfo.
 * Use `create(MessageThreadInfoSchema)` to create a new message.
 */
export declare const MessageThreadInfoSchema: GenMessage<MessageThreadInfo>;
/**
 * @generated from message tokagent.v1.MessageInfo
 */
export type MessageInfo = Message<"tokagent.v1.MessageInfo"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string channel_id = 2;
     */
    channelId: string;
    /**
     * @generated from field: string sender_id = 3;
     */
    senderId: string;
    /**
     * @generated from field: tokagent.v1.MessageContent content = 4;
     */
    content?: MessageContent;
    /**
     * @generated from field: google.protobuf.Timestamp timestamp = 5;
     */
    timestamp?: Timestamp;
    /**
     * @generated from field: optional google.protobuf.Timestamp edited = 6;
     */
    edited?: Timestamp;
    /**
     * @generated from field: optional google.protobuf.Timestamp deleted = 7;
     */
    deleted?: Timestamp;
    /**
     * @generated from field: optional bool pinned = 8;
     */
    pinned?: boolean;
    /**
     * @generated from field: optional tokagent.v1.MessageThreadInfo thread = 9;
     */
    thread?: MessageThreadInfo;
};
/**
 * Describes the message tokagent.v1.MessageInfo.
 * Use `create(MessageInfoSchema)` to create a new message.
 */
export declare const MessageInfoSchema: GenMessage<MessageInfo>;
/**
 * @generated from message tokagent.v1.MessageSendOptions
 */
export type MessageSendOptions = Message<"tokagent.v1.MessageSendOptions"> & {
    /**
     * @generated from field: optional string reply_to = 1;
     */
    replyTo?: string;
    /**
     * @generated from field: optional bool ephemeral = 2;
     */
    ephemeral?: boolean;
    /**
     * @generated from field: optional bool silent = 3;
     */
    silent?: boolean;
    /**
     * @generated from field: optional google.protobuf.Timestamp scheduled = 4;
     */
    scheduled?: Timestamp;
    /**
     * @generated from field: optional string thread = 5;
     */
    thread?: string;
    /**
     * @generated from field: optional string nonce = 6;
     */
    nonce?: string;
};
/**
 * Describes the message tokagent.v1.MessageSendOptions.
 * Use `create(MessageSendOptionsSchema)` to create a new message.
 */
export declare const MessageSendOptionsSchema: GenMessage<MessageSendOptions>;
/**
 * @generated from message tokagent.v1.MessageSearchOptions
 */
export type MessageSearchOptions = Message<"tokagent.v1.MessageSearchOptions"> & {
    /**
     * @generated from field: optional string query = 1;
     */
    query?: string;
    /**
     * @generated from field: optional string channel_id = 2;
     */
    channelId?: string;
    /**
     * @generated from field: optional string sender_id = 3;
     */
    senderId?: string;
    /**
     * @generated from field: optional google.protobuf.Timestamp before = 4;
     */
    before?: Timestamp;
    /**
     * @generated from field: optional google.protobuf.Timestamp after = 5;
     */
    after?: Timestamp;
    /**
     * @generated from field: optional int32 limit = 6;
     */
    limit?: number;
    /**
     * @generated from field: optional int32 offset = 7;
     */
    offset?: number;
    /**
     * @generated from field: optional bool has_attachments = 8;
     */
    hasAttachments?: boolean;
    /**
     * @generated from field: optional bool pinned = 9;
     */
    pinned?: boolean;
    /**
     * @generated from field: optional string mentions = 10;
     */
    mentions?: string;
};
/**
 * Describes the message tokagent.v1.MessageSearchOptions.
 * Use `create(MessageSearchOptionsSchema)` to create a new message.
 */
export declare const MessageSearchOptionsSchema: GenMessage<MessageSearchOptions>;
/**
 * @generated from message tokagent.v1.ChannelPermissions
 */
export type ChannelPermissions = Message<"tokagent.v1.ChannelPermissions"> & {
    /**
     * @generated from field: bool can_send = 1;
     */
    canSend: boolean;
    /**
     * @generated from field: bool can_read = 2;
     */
    canRead: boolean;
    /**
     * @generated from field: bool can_delete = 3;
     */
    canDelete: boolean;
    /**
     * @generated from field: bool can_pin = 4;
     */
    canPin: boolean;
    /**
     * @generated from field: bool can_manage = 5;
     */
    canManage: boolean;
};
/**
 * Describes the message tokagent.v1.ChannelPermissions.
 * Use `create(ChannelPermissionsSchema)` to create a new message.
 */
export declare const ChannelPermissionsSchema: GenMessage<ChannelPermissions>;
/**
 * @generated from message tokagent.v1.MessageChannel
 */
export type MessageChannel = Message<"tokagent.v1.MessageChannel"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string name = 2;
     */
    name: string;
    /**
     * @generated from field: string type = 3;
     */
    type: string;
    /**
     * @generated from field: optional string description = 4;
     */
    description?: string;
    /**
     * @generated from field: repeated tokagent.v1.MessageParticipant participants = 5;
     */
    participants: MessageParticipant[];
    /**
     * @generated from field: optional tokagent.v1.ChannelPermissions permissions = 6;
     */
    permissions?: ChannelPermissions;
    /**
     * @generated from field: optional google.protobuf.Timestamp last_message_at = 7;
     */
    lastMessageAt?: Timestamp;
    /**
     * @generated from field: optional int32 message_count = 8;
     */
    messageCount?: number;
    /**
     * @generated from field: optional int32 unread_count = 9;
     */
    unreadCount?: number;
};
/**
 * Describes the message tokagent.v1.MessageChannel.
 * Use `create(MessageChannelSchema)` to create a new message.
 */
export declare const MessageChannelSchema: GenMessage<MessageChannel>;
/**
 * @generated from message tokagent.v1.PostMedia
 */
export type PostMedia = Message<"tokagent.v1.PostMedia"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string url = 2;
     */
    url: string;
    /**
     * @generated from field: string type = 3;
     */
    type: string;
    /**
     * @generated from field: string mime_type = 4;
     */
    mimeType: string;
    /**
     * @generated from field: int64 size = 5;
     */
    size: bigint;
    /**
     * @generated from field: optional int32 width = 6;
     */
    width?: number;
    /**
     * @generated from field: optional int32 height = 7;
     */
    height?: number;
    /**
     * @generated from field: optional double duration = 8;
     */
    duration?: number;
    /**
     * @generated from field: optional string thumbnail = 9;
     */
    thumbnail?: string;
    /**
     * @generated from field: optional string description = 10;
     */
    description?: string;
    /**
     * @generated from field: optional string alt_text = 11;
     */
    altText?: string;
};
/**
 * Describes the message tokagent.v1.PostMedia.
 * Use `create(PostMediaSchema)` to create a new message.
 */
export declare const PostMediaSchema: GenMessage<PostMedia>;
/**
 * @generated from message tokagent.v1.PostLocationCoordinates
 */
export type PostLocationCoordinates = Message<"tokagent.v1.PostLocationCoordinates"> & {
    /**
     * @generated from field: double latitude = 1;
     */
    latitude: number;
    /**
     * @generated from field: double longitude = 2;
     */
    longitude: number;
};
/**
 * Describes the message tokagent.v1.PostLocationCoordinates.
 * Use `create(PostLocationCoordinatesSchema)` to create a new message.
 */
export declare const PostLocationCoordinatesSchema: GenMessage<PostLocationCoordinates>;
/**
 * @generated from message tokagent.v1.PostLocation
 */
export type PostLocation = Message<"tokagent.v1.PostLocation"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: optional string address = 2;
     */
    address?: string;
    /**
     * @generated from field: optional tokagent.v1.PostLocationCoordinates coordinates = 3;
     */
    coordinates?: PostLocationCoordinates;
    /**
     * @generated from field: optional string place_id = 4;
     */
    placeId?: string;
};
/**
 * Describes the message tokagent.v1.PostLocation.
 * Use `create(PostLocationSchema)` to create a new message.
 */
export declare const PostLocationSchema: GenMessage<PostLocation>;
/**
 * @generated from message tokagent.v1.PostAuthor
 */
export type PostAuthor = Message<"tokagent.v1.PostAuthor"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string username = 2;
     */
    username: string;
    /**
     * @generated from field: string display_name = 3;
     */
    displayName: string;
    /**
     * @generated from field: optional string avatar = 4;
     */
    avatar?: string;
    /**
     * @generated from field: optional bool verified = 5;
     */
    verified?: boolean;
    /**
     * @generated from field: optional int32 follower_count = 6;
     */
    followerCount?: number;
    /**
     * @generated from field: optional int32 following_count = 7;
     */
    followingCount?: number;
    /**
     * @generated from field: optional string bio = 8;
     */
    bio?: string;
    /**
     * @generated from field: optional string website = 9;
     */
    website?: string;
};
/**
 * Describes the message tokagent.v1.PostAuthor.
 * Use `create(PostAuthorSchema)` to create a new message.
 */
export declare const PostAuthorSchema: GenMessage<PostAuthor>;
/**
 * @generated from message tokagent.v1.PostEngagement
 */
export type PostEngagement = Message<"tokagent.v1.PostEngagement"> & {
    /**
     * @generated from field: int32 likes = 1;
     */
    likes: number;
    /**
     * @generated from field: int32 shares = 2;
     */
    shares: number;
    /**
     * @generated from field: int32 comments = 3;
     */
    comments: number;
    /**
     * @generated from field: optional int32 views = 4;
     */
    views?: number;
    /**
     * @generated from field: bool has_liked = 5;
     */
    hasLiked: boolean;
    /**
     * @generated from field: bool has_shared = 6;
     */
    hasShared: boolean;
    /**
     * @generated from field: bool has_commented = 7;
     */
    hasCommented: boolean;
    /**
     * @generated from field: bool has_saved = 8;
     */
    hasSaved: boolean;
};
/**
 * Describes the message tokagent.v1.PostEngagement.
 * Use `create(PostEngagementSchema)` to create a new message.
 */
export declare const PostEngagementSchema: GenMessage<PostEngagement>;
/**
 * @generated from message tokagent.v1.PostLinkPreview
 */
export type PostLinkPreview = Message<"tokagent.v1.PostLinkPreview"> & {
    /**
     * @generated from field: string url = 1;
     */
    url: string;
    /**
     * @generated from field: optional string title = 2;
     */
    title?: string;
    /**
     * @generated from field: optional string description = 3;
     */
    description?: string;
    /**
     * @generated from field: optional string image = 4;
     */
    image?: string;
};
/**
 * Describes the message tokagent.v1.PostLinkPreview.
 * Use `create(PostLinkPreviewSchema)` to create a new message.
 */
export declare const PostLinkPreviewSchema: GenMessage<PostLinkPreview>;
/**
 * @generated from message tokagent.v1.PostPollOption
 */
export type PostPollOption = Message<"tokagent.v1.PostPollOption"> & {
    /**
     * @generated from field: string text = 1;
     */
    text: string;
    /**
     * @generated from field: int32 votes = 2;
     */
    votes: number;
};
/**
 * Describes the message tokagent.v1.PostPollOption.
 * Use `create(PostPollOptionSchema)` to create a new message.
 */
export declare const PostPollOptionSchema: GenMessage<PostPollOption>;
/**
 * @generated from message tokagent.v1.PostPoll
 */
export type PostPoll = Message<"tokagent.v1.PostPoll"> & {
    /**
     * @generated from field: string question = 1;
     */
    question: string;
    /**
     * @generated from field: repeated tokagent.v1.PostPollOption options = 2;
     */
    options: PostPollOption[];
    /**
     * @generated from field: optional google.protobuf.Timestamp expires_at = 3;
     */
    expiresAt?: Timestamp;
    /**
     * @generated from field: optional bool multiple_choice = 4;
     */
    multipleChoice?: boolean;
};
/**
 * Describes the message tokagent.v1.PostPoll.
 * Use `create(PostPollSchema)` to create a new message.
 */
export declare const PostPollSchema: GenMessage<PostPoll>;
/**
 * @generated from message tokagent.v1.PostContent
 */
export type PostContent = Message<"tokagent.v1.PostContent"> & {
    /**
     * @generated from field: optional string text = 1;
     */
    text?: string;
    /**
     * @generated from field: optional string html = 2;
     */
    html?: string;
    /**
     * @generated from field: repeated tokagent.v1.PostMedia media = 3;
     */
    media: PostMedia[];
    /**
     * @generated from field: optional tokagent.v1.PostLocation location = 4;
     */
    location?: PostLocation;
    /**
     * @generated from field: repeated string tags = 5;
     */
    tags: string[];
    /**
     * @generated from field: repeated string mentions = 6;
     */
    mentions: string[];
    /**
     * @generated from field: repeated tokagent.v1.PostLinkPreview links = 7;
     */
    links: PostLinkPreview[];
    /**
     * @generated from field: optional tokagent.v1.PostPoll poll = 8;
     */
    poll?: PostPoll;
};
/**
 * Describes the message tokagent.v1.PostContent.
 * Use `create(PostContentSchema)` to create a new message.
 */
export declare const PostContentSchema: GenMessage<PostContent>;
/**
 * @generated from message tokagent.v1.PostThreadInfo
 */
export type PostThreadInfo = Message<"tokagent.v1.PostThreadInfo"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: int32 position = 2;
     */
    position: number;
    /**
     * @generated from field: int32 total = 3;
     */
    total: number;
};
/**
 * Describes the message tokagent.v1.PostThreadInfo.
 * Use `create(PostThreadInfoSchema)` to create a new message.
 */
export declare const PostThreadInfoSchema: GenMessage<PostThreadInfo>;
/**
 * @generated from message tokagent.v1.CrossPostInfo
 */
export type CrossPostInfo = Message<"tokagent.v1.CrossPostInfo"> & {
    /**
     * @generated from field: string platform = 1;
     */
    platform: string;
    /**
     * @generated from field: string platform_id = 2;
     */
    platformId: string;
    /**
     * @generated from field: string url = 3;
     */
    url: string;
};
/**
 * Describes the message tokagent.v1.CrossPostInfo.
 * Use `create(CrossPostInfoSchema)` to create a new message.
 */
export declare const CrossPostInfoSchema: GenMessage<CrossPostInfo>;
/**
 * @generated from message tokagent.v1.PostInfo
 */
export type PostInfo = Message<"tokagent.v1.PostInfo"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: tokagent.v1.PostAuthor author = 2;
     */
    author?: PostAuthor;
    /**
     * @generated from field: tokagent.v1.PostContent content = 3;
     */
    content?: PostContent;
    /**
     * @generated from field: string platform = 4;
     */
    platform: string;
    /**
     * @generated from field: string platform_id = 5;
     */
    platformId: string;
    /**
     * @generated from field: string url = 6;
     */
    url: string;
    /**
     * @generated from field: google.protobuf.Timestamp created_at = 7;
     */
    createdAt?: Timestamp;
    /**
     * @generated from field: optional google.protobuf.Timestamp edited_at = 8;
     */
    editedAt?: Timestamp;
    /**
     * @generated from field: optional google.protobuf.Timestamp scheduled_at = 9;
     */
    scheduledAt?: Timestamp;
    /**
     * @generated from field: tokagent.v1.PostEngagement engagement = 10;
     */
    engagement?: PostEngagement;
    /**
     * @generated from field: string visibility = 11;
     */
    visibility: string;
    /**
     * @generated from field: optional string reply_to = 12;
     */
    replyTo?: string;
    /**
     * @generated from field: optional tokagent.v1.PostThreadInfo thread = 13;
     */
    thread?: PostThreadInfo;
    /**
     * @generated from field: repeated tokagent.v1.CrossPostInfo cross_posted = 14;
     */
    crossPosted: CrossPostInfo[];
};
/**
 * Describes the message tokagent.v1.PostInfo.
 * Use `create(PostInfoSchema)` to create a new message.
 */
export declare const PostInfoSchema: GenMessage<PostInfo>;
/**
 * @generated from message tokagent.v1.PostCreateOptions
 */
export type PostCreateOptions = Message<"tokagent.v1.PostCreateOptions"> & {
    /**
     * @generated from field: repeated string platforms = 1;
     */
    platforms: string[];
    /**
     * @generated from field: optional google.protobuf.Timestamp scheduled_at = 2;
     */
    scheduledAt?: Timestamp;
    /**
     * @generated from field: optional string visibility = 3;
     */
    visibility?: string;
    /**
     * @generated from field: optional string reply_to = 4;
     */
    replyTo?: string;
    /**
     * @generated from field: optional bool thread = 5;
     */
    thread?: boolean;
    /**
     * @generated from field: optional tokagent.v1.PostLocation location = 6;
     */
    location?: PostLocation;
    /**
     * @generated from field: repeated string tags = 7;
     */
    tags: string[];
    /**
     * @generated from field: repeated string mentions = 8;
     */
    mentions: string[];
    /**
     * @generated from field: optional bool enable_comments = 9;
     */
    enableComments?: boolean;
    /**
     * @generated from field: optional bool enable_sharing = 10;
     */
    enableSharing?: boolean;
    /**
     * @generated from field: optional string content_warning = 11;
     */
    contentWarning?: string;
    /**
     * @generated from field: optional bool sensitive = 12;
     */
    sensitive?: boolean;
};
/**
 * Describes the message tokagent.v1.PostCreateOptions.
 * Use `create(PostCreateOptionsSchema)` to create a new message.
 */
export declare const PostCreateOptionsSchema: GenMessage<PostCreateOptions>;
/**
 * @generated from message tokagent.v1.PostSearchOptions
 */
export type PostSearchOptions = Message<"tokagent.v1.PostSearchOptions"> & {
    /**
     * @generated from field: optional string query = 1;
     */
    query?: string;
    /**
     * @generated from field: optional string author = 2;
     */
    author?: string;
    /**
     * @generated from field: optional string platform = 3;
     */
    platform?: string;
    /**
     * @generated from field: repeated string tags = 4;
     */
    tags: string[];
    /**
     * @generated from field: repeated string mentions = 5;
     */
    mentions: string[];
    /**
     * @generated from field: optional google.protobuf.Timestamp since = 6;
     */
    since?: Timestamp;
    /**
     * @generated from field: optional google.protobuf.Timestamp before = 7;
     */
    before?: Timestamp;
    /**
     * @generated from field: optional int32 limit = 8;
     */
    limit?: number;
    /**
     * @generated from field: optional int32 offset = 9;
     */
    offset?: number;
    /**
     * @generated from field: optional bool has_media = 10;
     */
    hasMedia?: boolean;
    /**
     * @generated from field: optional bool has_location = 11;
     */
    hasLocation?: boolean;
    /**
     * @generated from field: optional string visibility = 12;
     */
    visibility?: string;
    /**
     * @generated from field: optional string sort_by = 13;
     */
    sortBy?: string;
};
/**
 * Describes the message tokagent.v1.PostSearchOptions.
 * Use `create(PostSearchOptionsSchema)` to create a new message.
 */
export declare const PostSearchOptionsSchema: GenMessage<PostSearchOptions>;
/**
 * @generated from message tokagent.v1.Demographics
 */
export type Demographics = Message<"tokagent.v1.Demographics"> & {
    /**
     * @generated from field: map<string, double> age = 1;
     */
    age: {
        [key: string]: number;
    };
    /**
     * @generated from field: map<string, double> gender = 2;
     */
    gender: {
        [key: string]: number;
    };
    /**
     * @generated from field: map<string, double> location = 3;
     */
    location: {
        [key: string]: number;
    };
};
/**
 * Describes the message tokagent.v1.Demographics.
 * Use `create(DemographicsSchema)` to create a new message.
 */
export declare const DemographicsSchema: GenMessage<Demographics>;
/**
 * @generated from message tokagent.v1.TopPerformingHour
 */
export type TopPerformingHour = Message<"tokagent.v1.TopPerformingHour"> & {
    /**
     * @generated from field: int32 hour = 1;
     */
    hour: number;
    /**
     * @generated from field: int32 engagement = 2;
     */
    engagement: number;
};
/**
 * Describes the message tokagent.v1.TopPerformingHour.
 * Use `create(TopPerformingHourSchema)` to create a new message.
 */
export declare const TopPerformingHourSchema: GenMessage<TopPerformingHour>;
/**
 * @generated from message tokagent.v1.PostAnalytics
 */
export type PostAnalytics = Message<"tokagent.v1.PostAnalytics"> & {
    /**
     * @generated from field: string post_id = 1;
     */
    postId: string;
    /**
     * @generated from field: string platform = 2;
     */
    platform: string;
    /**
     * @generated from field: int32 impressions = 3;
     */
    impressions: number;
    /**
     * @generated from field: int32 reach = 4;
     */
    reach: number;
    /**
     * @generated from field: tokagent.v1.PostEngagement engagement = 5;
     */
    engagement?: PostEngagement;
    /**
     * @generated from field: int32 clicks = 6;
     */
    clicks: number;
    /**
     * @generated from field: int32 shares = 7;
     */
    shares: number;
    /**
     * @generated from field: int32 saves = 8;
     */
    saves: number;
    /**
     * @generated from field: optional tokagent.v1.Demographics demographics = 9;
     */
    demographics?: Demographics;
    /**
     * @generated from field: repeated tokagent.v1.TopPerformingHour top_performing_hours = 10;
     */
    topPerformingHours: TopPerformingHour[];
};
/**
 * Describes the message tokagent.v1.PostAnalytics.
 * Use `create(PostAnalyticsSchema)` to create a new message.
 */
export declare const PostAnalyticsSchema: GenMessage<PostAnalytics>;
//# sourceMappingURL=service_interfaces_pb.d.ts.map