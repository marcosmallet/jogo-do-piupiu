plugins {
    id("com.android.application")
}

val generatedGameAssets = layout.buildDirectory.dir("generated/game-assets")

val syncGameAsset by tasks.registering(Sync::class) {
    from(rootProject.layout.projectDirectory.file("../index.html"))
    into(generatedGameAssets)
}

android {
    namespace = "br.com.travessiadocanarinho.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "br.com.travessiadocanarinho.tv"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    sourceSets {
        named("main") {
            assets.srcDir("build/generated/game-assets")
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

tasks.named("preBuild").configure {
    dependsOn(syncGameAsset)
}

val packageDebugApk by tasks.registering(Copy::class) {
    dependsOn("assembleDebug")
    from(layout.buildDirectory.file("outputs/apk/debug/app-debug.apk"))
    into(rootProject.layout.projectDirectory.dir("dist"))
    rename { "travessia-canarinho-tv-debug.apk" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.16.0")
    testImplementation("junit:junit:4.13.2")
}
